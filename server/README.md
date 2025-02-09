![Build Status](https://github.com/kylebonnici/dts-lsp/actions/workflows/node.js.yml/badge.svg)

# DTS Language Server

This LSP is intended to be used with DTS Devicetree Specification Release v0.4 (https://devicetree.org)

## Installation

The language server can be found on https://www.npmjs.com/package/devicetree-language-server.

To install run
`npm i devicetree-language-server`

The LSP has only been tested with Node 20.

## Usage

This extension needs a client that supports Configuration Capability. The format for the configuration setting is of the type `Settings` as shown below:

```typescript
interface Context {
  ctxName: string | number;
  cwd?: string;
  includePaths?: string[];
  dtsFile: string;
  overlays?: string[];
  bindingType?: BindingType;
  zephyrBindings?: string[];
  deviceOrgTreeBindings?: string[];
  deviceOrgBindingsMetaSchema?: string[];
}

interface Settings {
  cwd?: string;
  defaultBindingType?: BindingType;
  defaultZephyrBindings?: string[];
  defaultDeviceOrgTreeBindings?: string[];
  defaultDeviceOrgBindingsMetaSchema?: string[];
  defaultIncludePaths?: string[];
  contexts?: Context[];
  preferredContext?: string | number;
  lockRenameEdits?: string[];
  autoChangeContext?: boolean;
  allowAdhocContexts?: boolean;
}
```

Sample configuration in for `kakoune` with `Zephyr` 3.7.99 or lator.
Contribution by [topisani](https://github.com/topisani)

```
hook -group lsp-project-zephyr global BufSetOption filetype=(devicetree) %{
   eval %sh{
      root=$(eval "$kak_opt_lsp_find_root" .build_info.yml $(: kak_buffile))
      [ -e "$root/.build_info.yml" ] || exit 0

      settings=$(cat ".build_info.yml" | yq -c '{ "defaultIncludePaths": .cmake.devicetree."include-dirs", "contexts": [{ "bindingType": "Zephyr", "zephyrBindings": .cmake.devicetree."bindings-dirs", "includePaths": .cmake.devicetree."include-dirs", "dtsFile": .cmake.devicetree.files[0], "overlays": .cmake.devicetree.files[1:] }], "preferredContext": 0 } | { devicetree: {settings: {"_": {devicetree: .}}}}' | yj -jt | sed '/^\[devicetree\]$/d')

      cat <<EOF
      set-option buffer lsp_servers %{
         [devicetree]
         root = '$root'
         command = "npm"
         args = ["x", "--", "devicetree-language-server", "--stdio"]
         # command = "node"
         # args = ["/home/topisani/git/dts-lsp/server/dist/server.js", "--stdio"]
         settings_section = "_"

      $settings
      }
EOF
   }
}
```

## Using Devicetree-Org bindings example

```json
{
  "devicetree.cwd": "/Users/user/Workspace/linux/",
  "devicetree.defaultIncludePaths": ["include"],
  "devicetree.defaultBindingType": "DevicetreeOrg",
  "devicetree.defaultDeviceOrgBindingsMetaSchema": [
    "/Users/user/Workspace/linuxBindings/dt-schema/dtschema/meta-schemas" // https://github.com/devicetree-org/dt-schema/tree/main/dtschema/meta-schemas
  ],
  "devicetree.defaultDeviceOrgTreeBindings": [
    "/Users/user/Workspace/linuxBindings/dt-schema/dtschema/schemas", // https://github.com/devicetree-org/dt-schema/tree/main/dtschema/schemas
    "/Users/user/Workspace/linux/Documentation/devicetree/bindings" // https://github.com/torvalds/linux/tree/master/Documentation/devicetree/bindings
  ]
}
```

## Functionality

Follows Devicetree Specification Release v0.4

### Semantic Tokens

Every element in the document will have semantic tokens to help highlight and color code the items.

### Document Symbols

Every element in the document will have document symbols to help navigate the document in a tree format.

### Diagnostics

#### Syntax

- Reports when property has been redefined and provides document link to where it has been redefined
- Reports when node has been deleted and provides document link to where it has been redefined
- Reports when property has been deleted and provides document link to where it has been redefined
- Reports label reuse conflicts
- Warns about duplicate node name in the same node
- Reports when deleting a node/property that does not exist
- Reports generic syntax issues such as missing "," , "}" , "<" , ">" etc...
- Reports missing values for properties
- Reports basic CPreprocessor issues such as missing macro name

#### Types

- Supports standard types as defined in chapter 2 of Devicetree Specification Release v0.4
  - Reports property type mismatch errors
  - Reports prop-encoded-values errors when these need to follow some pattern e.g interrupts
  - Compares the node address and ensures that it matches the reg property, and that the reg values use the appropriate number of values as defined by other properties
  - And more... (See Chapter 2 of Devicetree Specification Release v0.4 https://devicetree.org)

### Document Formatting

- Fixes indentation
- Fixes spacing between label names on assign
- Fixes spacing between node name and '{'
- Ensures new line between node/property/keywords. If there is one additional line this is kept; any additional lines are cleaned up.
- Ensures that composite values have single space between ',' and next value
- Ensures that Bytestring/prop-encoded-array values have single space between each value
- Ensures that no space exists between ';' and end of statement

### Completions

Completions are context aware of the document state on the line the action is requested.

- Node path completion
- Label reference completion in property assign values
- Delete Node:
  - Suggests appropriate type e.g. by reference or node name
  - Does not suggest keyword if no delete is possible
- Delete Property:
  - Suggests property names available in that context
  - Does not suggest keyword if no delete is possible
- Default values for standard types (e.g state)

### Code Actions

- Adds missing syntax e.g. ';', '<', '>', ',' etc...
- Removes syntactically incorrect spaces:
  - Between node name, '@' and address
  - In node path reference
- Removes ';' when used without any statement
- Suggests solutions for incomplete /delete-node/ keywords
- Suggests solutions for incomplete /delete-property/ keywords
- Supports SourceFixAll/QuickFixes

### Find Definition

- On node name/label reference; will list all the places where the node is altered. /delete-node/ cases are not listed.
- On property name; will list all the places where the property is assigned a value. Note: defining a property name with no assign (empty) is equal to assigning a truthful value and hence it will also be shown.

NOTE: If for example a node with name node1 has been created, then deleted, and then created again, depending on where the definition call is made in the file, in one case one will get the definition from before the delete keyword, and in the other case the definiton from under the delete keyword.

### Find Declarations

- On node name/label reference; will list the first places where the node is created.
- On property name; will list the first places where the property is assigned a value for the first time. Note: defining a property name with no assign (empty) is equal to assigning a truthful value and hence it will also be shown.

NOTE: The declarations will stop at the definition, hence, if for example a node with name node1 has been created, then deleted, and then created again, depending on where the declarations call is made in the file, in one case one will get the declarations from before the delete keyword up to the delete keyword, and in the other case from the delete keyword (excluded) onwards.

### Find References

- On node name/label reference; will list all the places where the node is used by name, label or in some path.
- On property name; will list all the places where the property referred to including /delete-property/.

NOTE: The references will stop at the definition, hence, if for example a node with name node1 has been created, then deleted, and then created again, depending on where the reference call is made in the file, in one case one will get the ones from before the delete keyword up to the delete keyword, and in the other case from the delete keyword (excluded) onwards.

### Hover

- On hover over the node name, a tooltip will show the final state of that node. If bindings are used it will also include the description from the binding files.

### Limitations

Parsing will only look at the files the devicetree uses. C header files will not be parsed to keep parsing fast enough. Hence there is no check on whether a macro exists and therefore there is no type checking.

## Bindings

At the moment, this LSP only supports bindings for the Zephyr project. Feel free to contribute to this project or reach out to request other formats.

## Refactoring

Refactoring is possible on the following elements:

- Node names
- Node labels
- Propery names

Given that in some cases the files included in a devicetree might come from an SDK which should not be edited, one can configure "lockRenameEdits" in the settings to lock refactoring from being permitted on any elements which would otherwise effect edits to the files listed in "lockRenameEdits".

### Road Map

- Formatting
  - Clean up trailing white spaces
- Implement syntax for Ternary operator
- Implement support #IF and #ELSEIF preprocessors
- Implement "Device Node Requirements" (chapter 3 - Devicetree Specification Release v0.4)
- Write more unit tests
- Let me know what you should be added or changed
