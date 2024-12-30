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
import { Issue, StandardTypeIssue } from "../../../types";
import { genIssue } from "../../../helpers";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver";

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

interface ZephyrBindingYml {
  filePath: string;
  include: string[];
  description?: string;
  compatible?: string;
  properties?: {
    [key: string]: {
      required: boolean;
      type: ZephyrPropertyType;
      deprecated: false;
      default: (string | number)[];
      description: string;
      enum: (string | number)[];
      const: "string" | "int" | "array" | "uint8-array" | "string-array";
      "specifier-space"?: string;
    };
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

  return generateOrTypeObj(PropertyType.UNKNOWN);
};

// const ZephyrDefaultTypeDefault = (type: ZephyrPropertyType, def: any) => {
//   switch (type) {
//     case "string":
//       return typeof def === "string" ? def : undefined;
//     case "int":
//       return typeof def === "number" ? def : undefined;
//     case "boolean":
//       return undefined;
//     case "array":
//       return Array.isArray(def) && def.every((v) => typeof v === "number")
//         ? def
//         : undefined;
//     case "uint8-array":
//       return Array.isArray(def) && def.every((v) => typeof v === "number")
//         ? def
//         : undefined;
//     case "string-array":
//       return Array.isArray(def) && def.every((v) => typeof v === "string")
//         ? def
//         : undefined;
//     case "phandle":
//       return undefined;
//     case "phandles":
//       return undefined;
//     case "phandle-array":
//       return undefined;
//     case "path":
//       return undefined;
//     case "compound":
//       return undefined;
//   }

//   return undefined;
// };

const resolveBinding = (
  bindings: ZephyrBindingYml[],
  binding: ZephyrBindingYml
) => {
  binding = binding.include.reduce((p, c) => {
    const toMergeIn = bindings.find((b) => basename(b.filePath) === c);
    if (toMergeIn) {
      p.include = p.include.filter((i) => i !== c);
      return mergeAintoB(bindings, toMergeIn, p) ?? p;
    }
    console.warn(`Unable to find ${c}`);
    return p;
  }, binding);

  if (!binding.include.length) {
    return binding;
  }
};

const mergeAintoB = (
  bindings: ZephyrBindingYml[],
  a: ZephyrBindingYml,
  b: ZephyrBindingYml
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
    const propertyFromA = resolvedA.properties?.[name] ?? {};
    const propertyFromB = resolvedB.properties?.[name] ?? {};

    newProperties = {
      ...newProperties,
      [name]: {
        ...(propertyFromA ?? {}),
        ...(propertyFromB ?? {}),
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

  // TODO Merge childrens and more

  return resolvedB;
};

const simplifiyInclude = (
  include: string | string[] | { name: string }[] | undefined
): string[] => {
  if (!include) {
    return [];
  }
  if (typeof include === "string") {
    return [include];
  }

  return include.map((i) => (typeof i === "string" ? i : i.name));
};

export class ZephyrBindingsLoader {
  private typeCache: NodeType[] = [];
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
      return [getStandardType()];
    }

    const cachedType = this.typeCache.filter((t) =>
      folders.some(
        (f) =>
          compatible.some((c) => c === t.compatible) &&
          t.bindingsPath?.startsWith(f)
      )
    );

    if (cachedType.length) {
      return cachedType;
    }

    this.loadTypeAndCache(folders);
    const out = this.typeCache.filter((t) =>
      folders.some(
        (f) =>
          compatible.some((c) => c === t.compatible) &&
          t.bindingsPath?.startsWith(f)
      )
    );
    return out.length ? out : [getStandardType()];
  }

  private loadTypeAndCache(folders: string[]) {
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
              include: simplifiyInclude(readData.include),
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
      this.typeCache.push(...convertBindingToType(resolvedBindings));
    });
  }
}

let zephyrBindingsLoader: ZephyrBindingsLoader | undefined;
export const getZephyrBindingsLoader = () => {
  zephyrBindingsLoader ??= new ZephyrBindingsLoader();
  return zephyrBindingsLoader;
};

const convertBindingToType = (bindings: ZephyrBindingYml[]) => {
  return bindings.map((binding) => {
    const nodeType = getStandardType();
    nodeType.compatible =
      binding.compatible ?? basename(binding.filePath, "yaml");
    nodeType.description = binding.description;
    nodeType.bindingsPath = binding.filePath;

    const cellsKeys = Object.keys(binding).filter((key) =>
      key.endsWith("-cells")
    );
    const cellsValues = cellsKeys.map((k) => ({
      specifier: k.replace(/-cells$/, ""),
      values: binding![k as CellSpecifier],
    }));
    if (cellsValues.length > 1) {
      console.log(cellsValues);
    }
    if (binding.properties) {
      Object.keys(binding.properties).forEach((name) => {
        const property = binding.properties![name];

        const existingProperty = nodeType.properties.find((p) =>
          p.getNameMatch(name)
        );
        if (existingProperty) {
          // TODO More..... and make this the way for all?
          existingProperty.required = () =>
            property.required ? "required" : "optional";
        } else {
          const prop =
            nodeType.properties.find((p) => p.getNameMatch(name)) ??
            new PropertyNodeType(
              name,
              ZephyrTypeToDTSType(property.type),
              property.required ? "required" : "optional",
              undefined, // TODO property.default,
              [], // TODO property.enum ?? []
              (p) => {
                const root = p.parent.root;
                const issues: Issue<StandardTypeIssue>[] = [];

                if (property.deprecated) {
                  issues.push(
                    genIssue(
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
                  property.type === "phandle" ||
                  property.type === "phandles" ||
                  property.type === "path"
                ) {
                  const values = flatNumberValues(p.ast.values);
                  values?.forEach((v) => {
                    const phandelValue = resolvePhandleNode(v, root);
                    if (!phandelValue) {
                      issues.push(
                        genIssue(
                          StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE,
                          v,
                          DiagnosticSeverity.Error
                        )
                      );
                    }
                  });
                }

                if (
                  property.type === "path" &&
                  p.ast.values?.values.at(0)?.value instanceof StringValue
                ) {
                  const path = p.ast.values?.values.at(0)?.value as StringValue;

                  const resolved: string[] = [];
                  path.value.split("/").every((p) => {
                    const node = root.getNode(p);
                    if (!node) {
                      issues.push(
                        genIssue(
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

                if (property.type === "phandle-array") {
                  const values = flatNumberValues(p.ast.values);
                  let i = 0;
                  while (values && i < values.length) {
                    const v = values[i];
                    const phandelValue = resolvePhandleNode(v, root);
                    if (!phandelValue) {
                      issues.push(
                        genIssue(
                          StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE,
                          v,
                          DiagnosticSeverity.Error
                        )
                      );
                      break;
                    }
                    let parentName = name.endsWith("es")
                      ? name.slice(0, -2)
                      : name.slice(0, -1);

                    if (parentName.endsWith("-gpio")) {
                      parentName = "gpio";
                    }

                    const sizeCellProperty = phandelValue.getProperty(
                      `#${parentName}-cells`
                    );

                    if (!sizeCellProperty) {
                      issues.push(
                        genIssue(
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

                    if (1 + sizeCellValue > values.length - i) {
                      issues.push(
                        genIssue(
                          StandardTypeIssue.CELL_MISS_MATCH,
                          values[values.length - i - 1],
                          DiagnosticSeverity.Error,
                          [],
                          [],
                          [
                            p.name,
                            `<${[
                              "phandel",
                              ...Array.from(
                                { length: sizeCellValue },
                                () => "size"
                              ),
                            ].join(" ")}>`,
                          ]
                        )
                      );
                    }
                    i += 1 + sizeCellValue;
                  }
                }

                return issues;
              }
            );
          prop.desctiption = property.description
            ? [property.description]
            : undefined;

          nodeType.properties.push(prop);
        }
      });
    }
    return nodeType;
  });
};
