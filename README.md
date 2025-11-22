![Build Status](https://github.com/kylebonnici/dts-lsp/actions/workflows/build-test.yml/badge.svg)

# DTS Language Server

This LSP is intended to be used with DTS Devicetree Specification Release v0.4 (https://devicetree.org)

## Table of Contents

- [Features](#features)
    - [Go to Definition](#go-to-definition)
    - [Go to Declarations](#go-to-declarations)
    - [Go to References](#go-to-references---find-all-references)
    - [Hover](#hover)
    - [Formatting](#formatting)
    - [Semantic Tokens](#semantic-tokens)
    - [Document Symbols](#document-symbols)
    - [Workspace Symbols](#workspace-symbols)
    - [Diagnostics](#diagnostics)
    - [Completions](#completions)
    - [Refactoring](#refactoring)
    - [Code Actions](#code-actions)
- [Usage](#usage)
    - [Zephyr](#zephyr-configuration-example)
    - [Linux](#linux)
    - [Devicetree-Org](#with-devicetree-org-bindings)

## Features

### Go to Definition

On node name/label reference; will list all the places where the node is altered. /delete-node/ cases are not listed.
On property name; will list all the places where the property is assigned a value. Note: defining a property name with no assign (empty) is equal to assigning a truthful value and hence it will also be shown.

![Go to Definition](docs/GoToDefinition.gif)

NOTE: If for example a node with name node1 has been created, then deleted, and then created again, depending on where the definition call is made in the file, in one case one will get the definition from before the delete keyword, and in the other case the definition from under the delete keyword.

#### Zephyr - DT_MACROS

You can also use `Go to Definition` on a selected number of DT\_ APIs found in zephyr and get Hovers to help explain Node state or even DT_MACRO result for the current active Devicetree context

![DT Macro Go to Definition](docs/DT_Definition.gif)

### Go to Declarations

On node name/label reference; will list the first places where the node is created.
On property name; will list the first places where the property is assigned a value for the first time. Note: defining a property name with no assign (empty) is equal to assigning a truthful value and hence it will also be shown.

![Go to Declarations](docs/GoToDeclarations.gif)

NOTE: The declarations will stop at the definition, hence, if for example a node with name node1 has been created, then deleted, and then created again, depending on where the declarations call is made in the file, in one case one will get the declarations from before the delete keyword up to the delete keyword, and in the other case from the delete keyword (excluded) onwards.

#### Zephyr - DT_MACROS

You can also use `Go to Declarations` on a selected number of DT\_ APIs found in zephyr and get Hovers to help explain Node state or even DT_MACRO result for the current active Devicetree context

![DT Macro Go to Declarations](docs/DT_Decleration.gif)

### Go to References - Find All References

- On node name/label reference; will list all the places where the node is used by name, label or in some path.
- On property name; will list all the places where the property referred to including /delete-property/.

![Go to References](docs/GoToReferences.gif)

NOTE: The references will stop at the definition, hence, if for example a node with name node1 has been created, then deleted, and then created again, depending on where the reference call is made in the file, in one case one will get the ones from before the delete keyword up to the delete keyword, and in the other case from the delete keyword (excluded) onwards.

### Hover

On hover over the node name, a tooltip will show the final state of that node. If bindings are used it will also include the description from the binding files.

![On Hover](docs/OnHoverNode.gif)

When hovering over a delete state you can see the state of the item just before the delete action.

![On Hover Deleted State](docs/OnHoverDeleteState.gif)

#### Zephyr - DT_MACROS

You can also hover on a selected number of DT\_ APIs found in zephyr and get Hovers to help explain Node state or even DT_MACRO result for the current active Devicetree context

![DT Hover](docs/DT_Hover.gif)

### Formatting

This LSP follows the [Zephyr Style Guide](https://docs.zephyrproject.org/latest/contribute/style/devicetree.html) and is used in CI to validate all files upstream.

![Formatting](docs/Formatting.gif)

### Semantic Tokens

Every element in the document will have semantic tokens to help highlight and color code the items.

![Document Symbols](docs/SemanticTokens.png)

### Document Symbols

Every element in the document will have document symbols to help navigate the document in a tree format.

![Semantic Tokens](docs/DocumentSymbols.gif)

### Workspace Symbols

You can also navigate the active context using workspace symbols.

![Workspace Symbols](docs/WorkspaceSymbols.png)

### Diagnostics

#### Reports generic syntax issues such as missing "," , "}" , ">" etc...

![Generic Syntax.png](docs/GenericSyntax.png)

#### Reports when property has been replaced by a later definition and provides document link to where it has been redefined

![Property Replaced](docs/PropertyReplaced.png)

#### Reports when node has been deleted and provides document link to where the delete was done

![Node Delete](docs/NodeDelete.png)

#### Reports when property has been deleted and provides document link to where it has been redefined

![Property Deleted](docs/PropertyDeleted.png)

#### Reports label conflicts

![Label Conflict](docs/LabelConflict.png)

#### Duplicate node name in the same node

![Duplicate Node Name](docs/DuplicateNodeName.png)

#### Reports when deleting a node/property that does not exist

![Invalid Delete](docs/InvalidDelete.png)

#### Reports CPreprocessor issues such as missing macro, invalid argument count etc.

![Macro Issues](docs/MacroIssues.png)

#### Compares the node address and ensures that it matches the reg property, and that the reg values use the appropriate number of values as defined `#address-cells`

![Node Address Mismatch](docs/NodeAddressMismatch.png)

#### Reports property type mismatch errors

![Wrong Property Type](docs/PropertyType.png)

#### Reports prop-encoded-values errors when these need to follow some expected pattern e.g interrupts/nexus

![Missing Flag Value](docs/PHandelArray.png)

#### Bus type validation when using Zephyr bindings

![Bus Type Validation](docs/BusType.png)

### Completions

Completions are context aware of the document state on the line the action is requested.

#### Node path completion

![Node Path Completion](docs/NodePathCompletion.gif)

#### Label reference completion reference node creation and property assignment

![Label Reference Completion](docs/NodePathCompletion.gif)

#### Delete Node:

- Suggests appropriate type e.g. by reference or node name
- Does not suggest keyword if no delete is possible

![Delete Node Completion](docs/DeleteNodeCompletion.gif)

#### Delete Property:

    - Suggests property names available in that context
    - Does not suggest keyword if no delete is possible

![Delete Property Completion](docs/DeletePropertyCompletion.gif)

#### Default values for standard types

![Enum Completion](docs/EnumCompletion.gif)

#### Zephyr DT_MACRO Completion

![DT MACRO Completion](docs/DT_Completaion.gif)

### Refactoring

Refactoring is possible on the following elements:

- Node names
- Node labels
- Property names

![Rename Node](docs/RenameNode.gif)

Given that in some cases the files included in a devicetree might come from an SDK which should not be edited, one can configure "lockRenameEdits" in the settings to lock refactoring from being permitted on any elements which would otherwise effect edits to the files listed in "lockRenameEdits".

### Code Actions

- Adds missing syntax e.g. ';', '<', '>', ',' etc...
- Removes syntactically incorrect spaces:
    - Between node name, '@' and address
    - In node path reference
- Removes ';' when used without any statement
- Supports SourceFixAll/QuickFixes

### Something else in mind?

Contributions are welcome or reach out on GitHub with requests.

## Usage

This extension needs a client that supports Configuration Capability. The format for the configuration setting is of the type `Settings` as shown below:

At the moment, this LSP only supports bindings for the Zephyr project and has experimental support for Devicetree-Org Bindings.

```typescript
interface Context {
	ctxName?: string | number;
	cwd?: string;
	includePaths?: string[];
	dtsFile: string;
	overlays?: string[];
	bindingType?: BindingType;
	zephyrBindings?: string[];
	deviceOrgTreeBindings?: string[];
	deviceOrgBindingsMetaSchema?: string[];
	lockRenameEdits?: string[];
	formattingErrorAsDiagnostics?: boolean;
	compileCommands?: string;
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
	defaultLockRenameEdits?: string[];
	defaultShowFormattingErrorAsDiagnostics?: boolean;
	autoChangeContext?: boolean;
	allowAdhocContexts?: boolean;
}
```

### Zephyr configuration example

```json
{
	"devicetree.cwd": "/User/workspace/zephyr",
	"devicetree.defaultIncludePaths": [
		"./zephyr/dts",
		"./zephyr/dts/arm",
		"./zephyr/dts/arm64/",
		"./zephyr/dts/riscv",
		"./zephyr/dts/common",
		"./zephyr/dts/vendor",
		"./zephyr/include",
		"./zephyr/dts/xtensa"
	],
	"devicetree.defaultBindingType": "Zephyr",
	"devicetree.defaultZephyrBindings": ["./zephyr/dts/bindings"],
	"devicetree.contexts": [
		{
			"devicetree.cwd": "/opt/nordic/ncs/v3.0.0",
			"bindingType": "Zephyr",
			"zephyrBindings": ["./zephyr/dts/bindings", "./nrf/dts/bindings"],
			"includePaths": [
				"./zephyr/dts",
				"./zephyr/dts/arm",
				"./zephyr/dts/arm64/",
				"./zephyr/dts/riscv",
				"./zephyr/dts/common",
				"./zephyr/dts/vendor",
				"./zephyr/include",
				"./zephyr/dts/xtensa"
			],
			"dtsFile": "./zephyr/boards/nordic/nrf52840dk/nrf52840dk_nrf52840.dts",
			"overlays": ["/User/project/myOverlay.overlay"]
		}
	]
}
```

### Linux

```json
{
	"devicetree.cwd": "/Users/user/Workspace/linux/",
	"devicetree.defaultIncludePaths": ["include"],
	"devicetree.defaultBindingType": "DevicetreeOrg",
	"devicetree.defaultDeviceOrgBindingsMetaSchema": [],
	"devicetree.defaultDeviceOrgTreeBindings": []
}
```

#### With Devicetree-Org Bindings

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

#### Note

Devicetree-Org bindings are experimental.
