import { getStandardType } from "../../../dtsTypes/standardTypes";
import {
  NodeType,
  PropertyNodeType,
  PropertyType,
} from "../../../dtsTypes/types";
import { Node } from "../../../context/node";
import yaml from "yaml";
import { glob } from "glob";
import { resolve, basename } from "path";
import { readFileSync } from "fs";
import { StringValue } from "../../../ast/dtc/values/string";
import {
  flatNumberValues,
  generateOrTypeObj,
  getU32ValueFromProperty,
  resolvePhandleNode,
} from "../../../dtsTypes/standardTypes/helpers";
import { FileDiagnostic, Issue, StandardTypeIssue } from "../../../types";
import { genStandardTypeDiagnostic } from "../../../helpers";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver";
import { Property } from "../../../context/property";

type ZephyrPropertyType =
  | "string"
  | "int"
  | "boolean"
  | "array"
  | "uint8-array"
  | "string-array"
  | "phandle"
  | "phandles"
  | "phandle-array"
  | "path"
  | "compound";

type ZephyrBindingsProperty = {
  required: boolean;
  type: ZephyrPropertyType;
  deprecated?: false;
  default?: string | number | (string | number)[];
  description?: string;
  enum?: (string | number)[];
  const?: string | number | (string | number)[];
  "specifier-space"?: string;
};
interface ZephyrBindingYml {
  filePath: string;
  include: { name: string; "property-blocklist"?: string[] }[];
  description?: string;
  compatible?: string;
  "child-binding"?: ZephyrBindingYml;
  bus: string | string[];
  "on-bus": string;
  properties?: {
    [key: string]: ZephyrBindingsProperty;
  };
  [key: CellSpecifier]: string[];
}

type CellSpecifier = `${string}-cells`;

const ZephyrTypeToDTSType = (type: ZephyrPropertyType) => {
  switch (type) {
    case "string":
      return generateOrTypeObj(PropertyType.STRING);
    case "int":
      return generateOrTypeObj(PropertyType.U32);
    case "boolean":
      return generateOrTypeObj(PropertyType.EMPTY);
    case "array":
      return generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY);
    case "uint8-array":
      return generateOrTypeObj(PropertyType.BYTESTRING);
    case "string-array":
      return generateOrTypeObj(PropertyType.STRINGLIST);
    case "phandle":
      return generateOrTypeObj(PropertyType.U32);
    case "phandles":
      return generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY);
    case "phandle-array":
      return generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY);
    case "path":
      return generateOrTypeObj([PropertyType.STRING, PropertyType.U32]);
    case "compound":
      return generateOrTypeObj(PropertyType.ANY);
  }
};

const ZephyrDefaultTypeDefault = (type: ZephyrPropertyType, def: any) => {
  switch (type) {
    case "string":
      return typeof def === "string" ? def : undefined;
    case "int":
      return typeof def === "number" ? def : undefined;
    case "boolean":
      return undefined;
    case "array":
      return Array.isArray(def) && def.every((v) => typeof v === "number")
        ? def
        : undefined;
    case "uint8-array":
      return Array.isArray(def) && def.every((v) => typeof v === "number")
        ? def
        : undefined;
    case "string-array":
      return Array.isArray(def) && def.every((v) => typeof v === "string")
        ? def
        : undefined;
    case "phandle":
      return undefined;
    case "phandles":
      return undefined;
    case "phandle-array":
      return undefined;
    case "path":
      return undefined;
    case "compound":
      return undefined;
  }
};

const resolveBinding = (
  bindings: ZephyrBindingYml[],
  binding: ZephyrBindingYml
): ZephyrBindingYml | undefined => {
  binding = binding.include.reduce((p, c) => {
    const toMergeIn = bindings.find((b) => basename(b.filePath) === c.name);
    if (toMergeIn) {
      const propertiesToExclude = c["property-blocklist"];
      p.include = p.include.filter((i) => i !== c);
      return mergeAintoB(bindings, toMergeIn, p, propertiesToExclude) ?? p;
    }
    console.warn(`Unable to find ${c}`);
    return p;
  }, binding);

  if (binding["child-binding"]) {
    binding["child-binding"].include = simplifiyInclude(
      binding["child-binding"].include
    );
    binding["child-binding"] = resolveBinding(
      bindings,
      binding["child-binding"]
    );
  }

  if (!binding.include.length) {
    return binding;
  }
};

const mergeAintoB = (
  bindings: ZephyrBindingYml[],
  a: ZephyrBindingYml,
  b: ZephyrBindingYml,
  propertiesToExclude: string[] = []
): ZephyrBindingYml | undefined => {
  const resolvedA = resolveBinding(bindings, a);
  const resolvedB = resolveBinding(bindings, b);

  if (!resolvedA || !resolvedB) {
    return;
  }

  // merge properties
  const allPropertiesNames = new Set<string>();
  Object.keys(resolvedA?.properties ?? {}).forEach((name) =>
    allPropertiesNames.add(name)
  );
  Object.keys(resolvedB?.properties ?? {}).forEach((name) =>
    allPropertiesNames.add(name)
  );

  let newProperties = {};
  Array.from(allPropertiesNames).forEach((name) => {
    const propertyFromA = propertiesToExclude?.some((n) => n === name)
      ? {}
      : resolvedA.properties?.[name] ?? {};
    const propertyFromB = resolvedB.properties?.[name] ?? {};

    newProperties = {
      ...newProperties,
      [name]: {
        ...propertyFromA,
        ...propertyFromB,
      },
    };
  });

  resolvedB.properties = newProperties;

  // merge cell specifiers
  const allSpecifierNames = new Set<string>();
  const cellsAKeys = Object.keys(resolvedA).filter((key) =>
    key.endsWith("-cells")
  );
  cellsAKeys.forEach((name) => allSpecifierNames.add(name));
  const cellsBKeys = Object.keys(resolvedA).filter((key) =>
    key.endsWith("-cells")
  );
  cellsBKeys.forEach((name) => allSpecifierNames.add(name));

  Array.from(allSpecifierNames).forEach((name) => {
    const fromA = resolvedA[name as CellSpecifier] ?? [];
    const fromB = resolvedB[name as CellSpecifier] ?? [];

    resolvedB[name as CellSpecifier] = Array.from([...fromA, ...fromB]);
  });

  return resolvedB;
};

const simplifiyInclude = (
  include:
    | string
    | (string | { name: string; "property-blocklist"?: string[] })[]
    | undefined
): { name: string; "property-blocklist"?: string[] }[] => {
  if (!include) {
    return [];
  }
  if (typeof include === "string") {
    return [{ name: include }];
  }

  return include.map((i) => (typeof i !== "string" ? i : { name: i }));
};

export class ZephyrBindingsLoader {
  private typeCache: Map<string, (node: Node) => NodeType> = new Map();
  private readFolders: string[] = [];

  static getNodeCompatible(node: Node) {
    const compatible = node.getProperty("compatible");
    const values = compatible?.ast.values;

    if (values?.values.some((v) => !(v?.value instanceof StringValue))) return;

    return values?.values.map((v) => (v?.value as StringValue).value);
  }

  getNodeTypes(folders: string[], node: Node): NodeType[] {
    const compatible = ZephyrBindingsLoader.getNodeCompatible(node);

    if (!compatible) {
      return [getStandardType(node)];
    }

    const cachedType = compatible
      .map((c) => this.typeCache.get(c)?.(node))
      .filter((t) => t) as NodeType[];

    if (cachedType.length) {
      return cachedType;
    }

    this.loadTypeAndCache(folders);
    const out = compatible
      .map((c) => this.typeCache.get(c)?.(node))
      .filter((t) => t) as NodeType[];

    return out.length ? out : [getStandardType(node)];
  }

  private loadTypeAndCache(folders: string | string[]) {
    folders = Array.isArray(folders) ? folders : [folders];

    folders.forEach((f) => {
      if (this.readFolders.indexOf(f) !== -1) {
        return;
      }

      this.readFolders.push(f);

      const g = glob.sync("**/*.yaml", { cwd: f, ignore: "test/*" });
      const bindings = g
        .map((bindingFile) => {
          bindingFile = resolve(f, bindingFile);
          try {
            const readData = yaml.parse(readFileSync(bindingFile, "utf-8"));
            return {
              ...readData,
              include: simplifiyInclude(readData?.include),
              filePath: bindingFile,
            } as ZephyrBindingYml;
          } catch (e) {
            console.warn(e);
          }
        })
        .filter((b) => !!b) as ZephyrBindingYml[];

      const resolvedBindings = bindings
        .map((b) => resolveBinding(bindings, b))
        .filter((b) => !!b && !b.include.length) as ZephyrBindingYml[];

      convertBindingsToType(resolvedBindings, this.typeCache);
    });
  }
}

let zephyrBindingsLoader: ZephyrBindingsLoader | undefined;
export const getZephyrBindingsLoader = () => {
  zephyrBindingsLoader ??= new ZephyrBindingsLoader();
  return zephyrBindingsLoader;
};

const convertBindingsToType = (
  bindings: ZephyrBindingYml[],
  map: Map<string, (node: Node) => NodeType>
) => {
  return bindings.forEach((binding) => {
    const compatible =
      binding.compatible ??
      (binding.filePath ? basename(binding.filePath, "yaml") : undefined);
    if (compatible) {
      map.set(compatible, (node: Node) => convertBindingToType(binding, node));
    }
  });
};

const convertBindingToType = (binding: ZephyrBindingYml, node?: Node) => {
  const nodeType = getStandardType(node);
  nodeType.compatible =
    binding.compatible ??
    (binding.filePath ? basename(binding.filePath, "yaml") : undefined);
  nodeType.description = binding.description;
  nodeType.bindingsPath = binding.filePath;
  nodeType.bus = typeof binding.bus === "string" ? [binding.bus] : binding.bus;
  nodeType.onBus = binding["on-bus"];

  const cellsKeys = Object.keys(binding).filter((key) =>
    key.endsWith("-cells")
  );
  const cellsValues = cellsKeys.map((k) => ({
    specifier: k.replace(/-cells$/, ""),
    values: binding![k as CellSpecifier],
  }));

  if (binding.properties) {
    Object.keys(binding.properties).forEach((name) => {
      const property = binding.properties![name];
      addToNodeType(nodeType, name, property);
      nodeType.cellsValues = cellsValues;
    });
  }

  if (binding["child-binding"]) {
    const childBinding = binding["child-binding"];
    nodeType.childNodeType = (n: Node) => convertBindingToType(childBinding, n);
  }

  return nodeType;
};

const addToNodeType = (
  nodeType: NodeType,
  name: string,
  property: ZephyrBindingsProperty
) => {
  const existingProperty = nodeType.properties.find((p) =>
    p.getNameMatch(name)
  );
  if (existingProperty && typeof existingProperty.name === "string") {
    existingProperty.required = () =>
      property.required ? "required" : "optional";
    existingProperty.values = () => property.enum ?? [];
    existingProperty.constValue = ZephyrDefaultTypeDefault(
      property.type,
      property.const
    );
    existingProperty.bindingType = property.type;

    const additionalTypeCheck = existingProperty.additionalTypeCheck;
    existingProperty.additionalTypeCheck = (p) => {
      return [
        ...generateZephyrTypeCheck(property, name, existingProperty)(p),
        ...(additionalTypeCheck?.(p) ?? []),
      ];
    };
  } else {
    let type =
      property.type === "compound"
        ? existingProperty?.type
        : ZephyrTypeToDTSType(property.type);
    type ??= ZephyrTypeToDTSType(property.type);
    const prop = new PropertyNodeType(
      name,
      type,
      property.required ? "required" : "optional",
      undefined, // TODO property.default ?,
      property.enum
    );
    prop.additionalTypeCheck = (p) => {
      const issues = [
        ...(existingProperty?.additionalTypeCheck?.(p) ?? []),
        ...generateZephyrTypeCheck(property, name, prop)(p),
      ];
      prop.typeExample ??= existingProperty?.typeExample;
      return issues;
    };
    prop.description = property.description
      ? [property.description]
      : existingProperty?.description;
    prop.bindingType = property.type;
    prop.constValue = ZephyrDefaultTypeDefault(property.type, property.const);

    nodeType.addProperty(prop);
  }
};

const generateZephyrTypeCheck = (
  property: ZephyrBindingsProperty,
  name: string,
  type: PropertyNodeType
) => {
  const myProperty = property;
  return (p: Property) => {
    const root = p.parent.root;
    const issues: FileDiagnostic[] = [];

    if (myProperty.const) {
      const quickValues = p.ast.quickValues;
      if (quickValues?.length == 1) {
        const constValues = Array.isArray(myProperty.const)
          ? myProperty.const
          : [myProperty.const];

        const equal =
          Array.isArray(quickValues[0]) &&
          constValues.length === quickValues[0].length &&
          quickValues[0].every(
            (v, i) =>
              (typeof v === "number" && Number.isNaN(v)) || constValues[i] === v
          );

        if (!equal) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.EXPECTED_VALUE,
              p.ast.values ?? p.ast,
              DiagnosticSeverity.Error,
              [],
              [],
              [
                `Binding expects values to be "${myProperty.type}" with value: ${myProperty.const}`,
              ]
            )
          );
        }
      }
    }

    if (myProperty.deprecated) {
      issues.push(
        genStandardTypeDiagnostic(
          StandardTypeIssue.DEPRECATED,
          p.ast,
          DiagnosticSeverity.Warning,
          [],
          [DiagnosticTag.Deprecated],
          [p.name]
        )
      );
    }

    if (
      myProperty.type === "phandle" ||
      myProperty.type === "phandles" ||
      myProperty.type === "path"
    ) {
      const values = flatNumberValues(p.ast.values);
      values?.forEach((v) => {
        const phandelValue = resolvePhandleNode(v, root);
        if (!phandelValue) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE,
              v,
              DiagnosticSeverity.Error
            )
          );
        }
      });
    }

    if (
      myProperty.type === "path" &&
      p.ast.values?.values.at(0)?.value instanceof StringValue
    ) {
      const path = p.ast.values?.values.at(0)?.value as StringValue;

      const resolved: string[] = [];
      path.value.split("/").every((p) => {
        const node = root.getNode(p);
        if (!node) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.UNABLE_TO_RESOLVE_PATH,
              path,
              DiagnosticSeverity.Error,
              [],
              [],
              [p, `/${resolved.join("/")}`]
            )
          );
        } else {
          resolved.push(p);
        }
        return !node;
      });
    }

    if (myProperty.type === "phandle-array") {
      const values = flatNumberValues(p.ast.values);
      let i = 0;
      while (values && i < values.length) {
        const v = values.at(i);
        const phandelValue = resolvePhandleNode(v, root);
        if (!phandelValue) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE,
              v ?? p.ast,
              DiagnosticSeverity.Error
            )
          );
          break;
        }

        let parentName = "";
        if (name.endsWith("-gpios")) {
          parentName = "gpio";
        } else {
          parentName = myProperty["specifier-space"] ?? name.slice(0, -1);
        }

        const sizeCellProperty = phandelValue.getProperty(
          `#${parentName}-cells`
        );

        if (!sizeCellProperty) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              p.ast,
              DiagnosticSeverity.Error,
              [...phandelValue.nodeNameOrLabelRef],
              [],
              [
                p.name,
                `#${parentName}-cells`,
                `/${phandelValue.path.slice(1).join("/")}`,
              ]
            )
          );
          break;
        }

        const sizeCellValue = sizeCellProperty
          ? getU32ValueFromProperty(sizeCellProperty, 0, 0) ?? 0
          : 0;

        const cellNames = phandelValue.nodeType?.cellsValues?.find(
          (i) => i.specifier === parentName
        )?.values;
        type.typeExample = `<${[
          "phandel",
          ...(cellNames ?? []),
          ...Array.from(
            {
              length: sizeCellValue - (cellNames?.length ?? 0),
            },
            () => "cell"
          ),
        ].join(" ")}>`;

        if (1 + sizeCellValue > values.length - i) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.CELL_MISS_MATCH,
              v ?? p.ast,
              DiagnosticSeverity.Error,
              [],
              [],
              [p.name, type.typeExample]
            )
          );
          break;
        }
        i += 1 + sizeCellValue;
      }
    }

    return issues;
  };
};
