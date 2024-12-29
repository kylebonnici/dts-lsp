# DTS Language server

This LSP is intended to be use with DTS Devicetree Specification Release v0.4 (https://devicetree.org)

## Usage

This extension needs a client that supports for Configuration Capability. The format for the setting is of type `Settings` as shown below

```typescript
interface Settings {
  defaultIncludePaths: string[];
  contexts: Context[];
  preferredContext?: number;
}

interface Context {
  includePaths?: string[];
  dtsFile: string;
  overlays: string[];
}
```

Sample configuration in VSCode `settings.json`

```json
{
  "deviceTree.defaultIncludePaths": [
    "/opt/nordic/ncs/v2.9.0/zephyr/dts",
    "/opt/nordic/ncs/v2.9.0/zephyr/dts/arm",
    "/opt/nordic/ncs/v2.9.0/zephyr/dts/arm64/",
    "/opt/nordic/ncs/v2.9.0/zephyr/dts/riscv",
    "/opt/nordic/ncs/v2.9.0/zephyr/dts/common",
    "/opt/nordic/ncs/v2.9.0/zephyr/include"
  ],
  "deviceTree.contexts": [
    {
      "includePaths": [
        "/opt/nordic/ncs/v2.9.0/zephyr/dts",
        "/opt/nordic/ncs/v2.9.0/zephyr/dts/arm",
        "/opt/nordic/ncs/v2.9.0/zephyr/dts/arm64/",
        "/opt/nordic/ncs/v2.9.0/zephyr/dts/riscv",
        "/opt/nordic/ncs/v2.9.0/zephyr/dts/common",
        "/opt/nordic/ncs/v2.9.0/zephyr/include"
      ],
      "dtsFile": "/opt/nordic/ncs/v2.9.0/zephyr/boards/nordic/nrf52840dk/nrf52840dk_nrf52840.dts",
      "overlays": [
        "/Users/user/Workspace/vscode/samples/hello_world/myApp.overlay"
      ]
    }
  ],
  "deviceTree.preferredContext": 0
}
```

## Functionality

- Follows Devicetree Specification Release v0.4

### Semantic Tokens

- Every element in the document will have sematic tokens to help highlight and color code the items

### Document Symbols

- Every element in the document will have document symbols to help navigate in the document in a tree format

### Diagnostics

#### Syntax

- Show when property has been redefined and provides document link to where it has be redefined
- Show when node has been deleted and provides document link to where it has be redefined
- Show when property has been deleted and provides document link to where it has be redefined
- Label Reuse conflicts.
- Duplicate node name in the same node conflict warning.
- Delete node/property that does not exist
- Generic syntax issues such as missing "," , "}" , "<" , ">" etc..
- Report missing values for properties.
- Report basic CPreprocessor issues such as missing macro name.

#### Types

- Supports standard types as defined in chapter 2 of Devicetree Specification Release v0.4
  - Report property type mismatch errors
  - Reports prop-encoded-values error when these need to follow some pattern e.g interrupts
  - Compare the node address and ensure that it matches the reg property, and that the reg values uses ha the appropriate number of values as defined by other properties
  - And more... (See Chapter 2 of Devicetree Specification Release v0.4 https://devicetree.org)

### Document Formatting

- Fixes indentation
- Single space between label names on assign
- Single space between node name and '{'
- Ensure New line between node/property, is there is one additional line this is keep any additional lines are cleaned up.
- Ensure that composite values have single space between ',' and next value
- Ensure that BytesString/Prop-Encoded-Array values have single space between each value
- Ensure that no space exists between ';' and end of statement

### Completions

Completions are context aware of the document state on the line the action is requested.

- Node path completion.
- Label reference completion in property assign values.
- Delete Node:
  - Suggest appropriate type e.g. by reference or node name.
  - Does not suggest keyword if no delete is possible.
- Delete Property:
  - Does not suggest keyword if no delete is possible.
- Default values for standard types (e.g state)

### Code Actions

- Add missing syntax e.g. ';', '<', '>', ',' etc...;
- Removes Addition Spaces:
  - Between node name, '@' and address.
  - Node Path reference.
- Removes ';' when use without any statement.
- Fixes incomplete /delete-node/ keywords
- Fixes incomplete /delete-property/ keywords
- Supports SourceFixAll/QuickFixes.

### Find References

- On node name/label reference; will list all the places where the node is used by name, label or in some path.
- On name property name; will list all the places where the property referred to including /delete-property/.

NOTE: That the references will stop at the definition hence if for example a node with name node1 has been create then deleted and then created again, depending on where the reference call is made in the file in one case one will get the ones before the delete up to the delete, and in the other case from the delete (excluded) onwards

### Find Definition

- On node name/label reference; will list all the places where the node is altered will be shown. /delete-node/ cases are not listed.
- On name property name; will list all the places where the property is assigned a values. Note: defining a property name with no assign is equal to assign empty and is also shown.

### Find Declarations

- On node name/label reference; will list the first places where the node is created.
- On name property name; will list the first places where the property is assigned a values for the first time. Note: defining a property name with no assign is equal to assign empty and will be shown.

### Hover

- Hover over Node name, Node Label will show the final state of that node

### Limitations

- Parsing will only look at the files the device tree uses. C Header files will not be parsed to keep parsing fast enough. Hence no check on if a Macro exists or not is made.

### Road Map

- Formatting
  - Clean up trailing white space
- Syntax for Ternary operators
- Support #IF #ELSEIF preprocessors
- Device Node Requirements (chapter 3 - Devicetree Specification Release v0.4)
- Device Bindings (chapter 4 - Devicetree Specification Release v0.4)
  - See how one can implement one implementation that works for Zephyrs and Linux Kernel Developers
  - Consider to extend Rename to bindings types?
- More unit tests
- Let me know what you should be added chnaged :)
