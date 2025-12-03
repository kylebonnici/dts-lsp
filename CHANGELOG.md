# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.7.2] - Unreleased

### Fixed

- Fixed incorrect `Unknown macro` error when arguments are empty.

## [0.7.1] - 2025-12-02

### Added

- Formatting node address to lowercase hex
- Formatting reg hex values to lowercase hex

## [0.7.0] - 2025-11-29

### Added

- Format properties values that exceed `wordWrapColumn`.

### Fixed

- Fixed and issue when parsing nodePath References where node has a address such as
  `&{/soc/peripheral@50000000/flash-controller@39000/flash@0/partitions}`.

## [0.6.8] - 2025-11-22

### Security

- Update `glob` to address CVE-2025-64756
- Update `js-yaml` to address CVE-2025-64718

### Added

- Support for macros resolving to strings inside array values.
- Formatting for content inside a macro such as #IF & #IFDEF that is not active

### Fixed

- Fixed an issue with downgrading some diagnostics issues related to macros when
  not on a `.dts` context
- Fixed an issue where left shift, right shift operators where swapped in the toString().
- Fixed an issue with zephyr bindings where `child-binding` where not merged when a binding
  included another binding and both have `child-binding`
- Fixed for zephyr bindings a warning 'Property "\*-controller" name is not defined in the
  type binding for this node'.
- Fixed diagnostic not showing issue for syntax like `node {};` in the root of the document
- Fixed issue with parser for syntax like `#IF defined (BUFSIZE) && BUFSIZE >= 1024`.
- Fixed an issue where Formatter would add an unnecessary new line above nodes when these are
  just after some `#IF` or `#IFDEF` etc...
- Fixed a server crash when there is no code between an #else...#endif
- Fixed code completion not showing inside macro blocks such as #ifdef...#endif
- Fixed an issue where no diagnostic was reported when node has an address and is linked
  to a Zephyr binding and reg is missing.
- Fixed an issue with Zephyr bindings when a property is defined in multiple includes as the
  properly was not merged correctly.
- Fixed an issue with `Go to Definitions` would provide the `Go to Declarations` result
  on DT_MACROS

## [0.6.7] - 2025-11-04

### Changed

- When a context is not for a `.dts` file, diagnostic errors not related to syntax errors
  are downgraded to warnings.

### Fixed

- Fixed an issue with formatting traling whitespace on windows.

## [0.6.6] - 2025-11-02

### Fixed

- Fixed an issue with server crashing when edits are done to multiple files including an overlay.
- Fixed an issue with LSP reporting incorrect context state when edits are done to multiple files including
  an overlay file, resulting in other issues such as incorrect formatting, code actions and more.
- Fixed an issue with comments as Macro params being formatted. These comments are no longer
  touched by formatter.

## [0.6.5] - 2025-10-31

### Fixed

- Fixed formatting diagnostic message when no indentation is needed.
- Fixed formatting diagnostic message when spaces need to be removed.

## [0.6.4] - 2025-10-29

### Changed

- In a multi-workspace `${workspaceFolder}` now resolves to:
    - The absolute path of the first workspace in which the dtsFile is in
    - If none are found it falls back to path of the first workspace.

### Fixed

- Fixed disgnostic issue `Macro expects less arguments` when calling a variadic macro.
- Fixed formatting issue where arguments of a MACRO call are forced on one line.
  Formater will no longer format arguments inside a macro call.
- Fixed issue where formatter would not format first value after `(` properly
  when the value is not on the same line as `(`
- Fixed exception for 3rd party extention API `'devicetree/newActiveContext' failed with message: Cannot read properties of null (reading 'settings')`
- Fixed an issue with parser when processing files that use macros to generate code.

## [0.6.3] - 2025-10-24

### Fixed

- Fixed reference resolution issue when using numeric phandle values instead of label references or node paths.
- Fixed Server crash when phandle values are beeing resolved and are in this state `phandle = <>;`
- Fixed `undefined` in formatting diagnostic messages

## [0.6.2] - 2025-10-21

### Added

- Generate context output will now show the path from where the property originated.
- Support for Range Formatting.

### Fixed

- Syntax errors in the generated `Generate context output`
- Formatting issues with the generated `Generate context output`
- Respect atomic nature of certain edits when applying dts-format on/off
- Parser error on `/plugin/`
- Parser error on `#error`

## [0.6.1] - 2025-10-14

### c

- Number values will be shown in the preferred radix as described in the source
  code when these are visualized for example in hovers. Example:

```devicetree
      reg = <0xff0000 /* 16711680 */ 0x1000 /* 4096 */>;
			#nordic,ficr-cells = <1 /* 0x1 */>;
```

### Fixed

- Formatting dignostic warnings are only shown for the open files in the context.
- Fixed code action title when new lines need to be inserted.
- Fixed server crash when parsing string token with an empty string token value

## [0.6.0] - 2025-10-14

### Added

- Support to resolve workspace folders in settings e.g `${workspaceFolder:name}`
- Support type signature for `interrupts` with Zephyr bindings using `interrupt-cells`
- Support type signature for `interrupts-extended` with Zephyr bindings using `interrupt-cells`
- Added Diagnostic events for formatting issues. These can be disabled by setting the
  `defaultShowFormattingErrorAsDiagnostics` or `showFormattingErrorAsDiagnostics` to false

### Fixed

- Fixed an issue where server was not consuming the initial setting from lsp client such
  resulting in no context to start `yegappan/lsp`
- Fixed support for node path reference for root i.e. `&{/}`

## [0.5.7] - 2025-10-09

### Fixed

- Fixed support for insertFinalNewline when formatting files.
- Fixed support for trimFinalNewlines when formatting files.

## [0.5.6] - 2025-10-08

### Fixed

- Fixed an issue with parsing block comment after line comment when block comment has "'" or '"' inside of it.
- Fixed an issue where logical not '!' in expression was not supported properly.
- Fixed an issue when formatting properties when `>` or `]` are move on the same line as the last value
  and there is a line comment after the last value, hence commenting out the `>` or `]`.
- Fixed an issue with lexer when `true` and `false` are next to other tokens e.g. `cavium,false-ide`

## [0.5.5] - 2025-09-20

### Added

- Diagnostic check to ensure node name and property names do not match.

### Fixed

- Fixed an issue with server crashing when loading zephyr binding with `property-allowlist` or `property-blocklist`
- Fixed an issue with reporting `Node name alredy defined` when `node{};` and `node@10{}` under the same parent.
- Fixed an issue with enforcing new lines between nodes when they are on the same line such as `node1 {};node2 {};`

## [0.5.4] - 2025-09-19

### Fixed

- Fixed an issue with 3rdParty integration where workspace diagnostics are shown even when no dts files are open.
- Fixed an issue where the active context does not update when switching bwteen tabs.

## [0.5.3] - 2025-09-18

### Fixed

- Fixed an issue with Diagnostics not showing when onDidOpen and onDidClose events occur close to each other
  and only one file from context is open

## [0.5.2] - 2025-09-17

### Fixed

- Fixed Typos in some messages

## [0.5.1] - 2025-09-12

### Fixed

- Fixed a formatting issue with expressions containing multiple operators, e.g. `(1 + 2 + 3)`.
- Fixed a parser issue where `0XD` was not recognized as the hex value `0xD`, resulting in formatting that split it into `0 XD`,
  incorrectly assuming `XD` was a macro.

### Changed

- Comments are now only formatted when the comment's first token is also the first token on the line.
- Formats `prop = < >;` as `prop = <>;`
- Formats `prop = [ ];` as `prop = [];`
- Ensures that when a property or a node follows an opening brace `{`, it is
  placed on the next indented line (instead of adding an extra blank line).
    - Example:
        - Before:

            ```
            {

                prop = ...
            ```

        - After:
            ```
            {
                prop = ...
            ```

- Enforces that formatting nodes include a blank line before nodes,  
  except when the node immediately follows `{`.

## [0.5.0] - 2025-08-29

### Added

- Code Completion, Hover, Go to Definition and Go to Declaration in C/C++ files for:
    - **Bus helpers**
        - DT_BUS
        - DT_ON_BUS
    - **Chosen nodes**
        - DT_CHOSEN
        - DT_HAS_CHOSEN
    - **Node identifiers and helpers**
        - DT_INVALID_NODE
        - DT_ROOT
        - DT_PATH
        - DT_NODELABEL
        - DT_ALIAS
        - DT_HAS_ALIAS
        - DT_NODE_HASH
        - DT_INST
        - DT_PARENT
        - DT_GPARENT
        - DT_CHILD
        - DT_COMPAT_GET_ANY_STATUS_OKAY
        - DT_NODE_PATH
        - DT_NODE_FULL_NAME
        - DT_NODE_FULL_NAME_UNQUOTED
        - DT_NODE_FULL_NAME_TOKEN
        - DT_NODE_FULL_NAME_UPPER_TOKEN
        - DT_NODE_CHILD_IDX
        - DT_CHILD_NUM
        - DT_CHILD_NUM_STATUS_OKAY
        - DT_SAME_NODE
        - DT_NODELABEL_STRING_ARRAY
    - **Property accessors**
        - DT_PROP
        - DT_PROP_LEN
        - DT_PROP_LEN_OR
        - DT_PROP_HAS_IDX
        - DT_PROP_HAS_NAME
        - DT_PROP_BY_IDX
        - DT_PROP_LAST
        - DT_PROP_OR
        - DT_ENUM_IDX_BY_IDX
        - DT_ENUM_IDX
        - DT_ENUM_IDX_BY_IDX_OR
        - DT_ENUM_IDX_OR
        - DT_ENUM_HAS_VALUE_BY_IDX
        - DT_ENUM_HAS_VALUE
        - DT_STRING_TOKEN
        - DT_STRING_TOKEN_OR
        - DT_STRING_UPPER_TOKEN
        - DT_STRING_UPPER_TOKEN_OR
        - DT_STRING_UNQUOTED
        - DT_STRING_UNQUOTED_OR
        - DT_STRING_TOKEN_BY_IDX
        - DT_STRING_UPPER_TOKEN_BY_IDX
        - DT_STRING_UNQUOTED_BY_IDX
        - DT_PROP_BY_PHANDLE_IDX
        - DT_PROP_BY_PHANDLE_IDX_OR
        - DT_PROP_BY_PHANDLE
        - DT_PHA_BY_IDX
        - DT_PHA_BY_IDX_OR
        - DT_PHA
        - DT_PHA_OR
        - DT_PHA_BY_NAME
        - DT_PHA_BY_NAME_OR
        - DT_PHANDLE_BY_NAME
        - DT_PHANDLE_BY_IDX
        - DT_PHANDLE
- `compileCommands?: string;` added to context settings to extend the `DT_`
  macros functionality to find definitions included in the header files.
- Code completions now include documentation for items where relevant.
- Code Action for nodes: `Property "reg" is required` — adds the address of the node.
- Diagnostic error when a Zephyr binding is intended for a bus but the node is not on the bus.

### Changed

- Document formatting is not performed if the document has syntax errors.

### Fixed

- Fixed an issue where an exception was thrown when doing completion on `#include <...>` if one of the
  includes in the context settings did not exist.
- Fixed an issue where if the `reg` property was required (due to binding, for example) and the node address was missing,
  no diagnostic error was shown.
- Fixed an issue where signature help did not always work for `reg`, `dmaRanges`, `ranges`, and `allocRanges`.
- Fixed an issue where code snippets for node references (e.g., `&spi0 {...}`) would add an extra `{};`.

## [0.4.10] - 2025-08-09

### Added

- Property types for Zephyr node `zephyr,user`.
- Document links in Zephyr Binding files included bindings.
- Formatting rule for macros inside parentheses:
    - Example: `prop = <(MACRO(x))>;` → `prop = <MACRO(x)>`
    - Does not apply when there are additional operations: `prop = <(MACRO(x) + 1)>;` (unchanged).

### Fixed

- Issue in Zephyr bindings where a child node should use its parent node's bus type to find a matching binding.
- Issue where renaming labels did not update labels linked to a referenced node.
- Parser issue where `...VAL (1 + 2)...` was incorrectly parsed as `VAL(1 + 2)`.

## [0.4.9] - 2025-07-11

### Added

- Warning when a property is used and it is not in the binding
- Support for `property-allowlist` for Zephyr bindings
- Warning for zephyr context when using pinctrl and `pinctrl-name` property does not have a name for each pinctrl state
- Warning for zephyr context when phandle-array and `<space-specifier>-name` property does not have a name for each phandle-array item
- Warning when parent node has `ranges` defined and child node has `reg` that does not map to any range
- Inform when child nodes have overlapping reg values

### Changed

- 'File not in context' downgraded from warning to information
- Formatting node enforce `<`, `>`, `[`, `]` to be on the same line as the value

### Fixed

- Issue with caching incorrect zephy binding for multiple context with different root binding directories
- Performance regression introduced in v0.4.8

## [0.4.8] - 2025-07-09

### Added

- Mark any `zephyr` binding that LSP is unable to be loaded or find with a `hint` diagnostic and `Unnecessary` tag
- Standard `simple-bus` binding from DTS specification.
- Automatically look for binding with zephyr bindings next to board file in `boardFile/dtc/bindings`

### Fixed

- Issue with loading `zephyr` bindings with multiple `zephyrBindings` directories in configuration.

## [0.4.7] - 2025-07-08

### Added

- Disable formatting from between line where `// dts-format off` is to `// dts-format on`
- Disable formatting from between line and character where start `/* dts-format off */`
  is to line and character where `/* dts-format on */` ends

### Fixed

- Comment Block formatting `*/` now wraps to a new line.
- Parser reporting `Unknown Syntax` in some exceptional cases for no apparent reason.
- Parser support negative values in expression e.g.

```
/ {
	node {
		lower-temperature-limit = <(-100)>;
	};
};
```

## [0.4.6] - 2025-07-06

### Added

- Auto completion for Bindings.

### Fixed

- More improvements and stability to formatting.
- OnHover over Node names.
- Incorrect macro completion list when inside a string.
- Parser now support `\` at end of line when calling a macro.
- Parsing issue when line comment has `"` or `'`

## [0.4.5] - 2025-07-02

### Added

- Support for node name by path reference e.g

```devicetree
&{/node1/node2@20/node3}{
  prop1;
}
```

### Fixed

- Fix issue where `/delete-node/` did not respect order when used inside child node

```devicetree
/ {
    node1 {
        /delete-node/ node2; // should not delete the next line
        node2 { };
    };
};
```

- Fix issue where `/delete-node/` did not respect order when used inside reference node e.g.

```devicetree
n1& {
    /delete-node/ node2;
    node2 { };
};
```

- Parser can handel node names starting with a number. A diagnostic error is show in this case.
- Parser can handel node unit addresses starting with `0x`. A diagnostic warning is show in this case.
- Parser can handel node unit addresses ending with `ULL`. A diagnostic warning is show in this case.
- Parser can handel node unit addresses with `_` e.g `node@8_000_00`.
- Improve semantic tokens for node paths e.g. `...&{/node1/node2@20/node3}`
- Diagnostic error when node path reference have space between ampersand and open curly e.g. `&  {...}`
- Formatting issue when the same file is included multiple times.
- Comment formatting inside a ref node e.g.

```devicetree
&n1 {
  /* foo */
  prop1;
}
```

- Formatting when properties are included e.g.

```devicetree
&qspi {
	nrf70: nrf7002@1 {
		compatible = "nordic,nrf7002-qspi";
		status = "okay";
		reg = <1>;
		qspi-frequency = <24000000>;
		qspi-quad-mode;

		#include "nrf70_common.dtsi"
		#include "nrf70_common_5g.dtsi"
	};
};
```

## [0.4.4] - 2025-06-27

### Fixed

- Formatting now allows empty node `};` to be on the same line like so `&node { };`

## [0.4.3] - 2025-06-27

### Fixed

- `Find All References` on properties listed `/delete-property/` not linked to the property in question
- `Rename Edit` on properties changed `/delete-property/` not linked to the selected in question
- OnHover now shows unique labels for a node.
- Generated compiled output now shows unique labels for a node.
- Semantic token for node addresses now cover the complete address.
- LSP no longer crashes when ranges does not have the correct number or arguments.

## [0.4.2] - 2025-06-02

### Added

- Folding ranges of Block Comments.
- Added `label assign` to Workspace Symbols.

### Fixed

- Unused required properties will now show on top of auto completion list.
- Resolve default settings `defaultLockRenameEdits` with `cwd`
- Node `Disabled by` point to the property with `statues = "disabled"`and not the node this property is in.

## [0.4.1] - 2025-05-25

### Added

- Support for macros signature help.

### Changed

- Moved property type examples to native lsp signature help.

### Fixed

- Only the first `DT_ALIAS` was provided for a node.
- Diagnostic range when label is missing for a Node reference.

## [0.4.0] - 2025-05-03

### Added

- `reserved-memory` child node types.
- Require of `#address-cells` to be defined on node parent when using `interrupt` property.
- Require of `#address-cells` to be defined when using `interrupt-map` property.
- Require of `#address-cells` to be defined on node parent when using `interrupts-extended` property.
- Validation of `interrupt` property is linking to a `interrupt-map` entry.
- Validation of `interrupts-extended` property is linking to a `interrupt-map` entry.
- Validation of `interrupt-map-mask` has the correct number of `U32` values.
- Validation of `interrupt-map` entries that none overlap.
- Validation of `nexus-map-mask` has the correct number of `U32` values.
- Validation of `nexus-map-pass-thru` has the correct number of `U32` values.
- Validation of `nexus-map` entries that none overlap.
- Validation in `Zephyr` bindings when a property is linking to a nexus-map entry.
- OnHover information for nexus-map entry for links.

### Fixed

- Chassis Type description
- Formatting not working when document has

```devicetree
prop1 = <
				10>;
```

### Removed

- Validation of `ranges` property to ensure it does not exceed the `reg` property address range.
- Validation of `ranges` property to ensure ranges do not overlap.
- Validation of `dma-ranges` property to ensure ranges do not overlap.
- Validation of `reg` property to ensure it does not exceed the parent node's `reg` range when mapped and defined.

## [0.3.3] - 2025-05-01

### Fixed

- Warning message when reg exceeds range for address mapping.
- Flicker when selecting a text editor that does not have 'devicetree' languageId

## [0.3.2] - 2025-04-30

### Added

- Validation of `ranges` property to ensure it does not exceed the `reg` property address range.
- Validation of `ranges` property to ensure ranges do not overlap.
- Validation of `dma-ranges` property to ensure ranges do not overlap.
- Validation of `reg` property to ensure it does not exceed the mapping address range, if mapped.
- Validation of `reg` property to ensure it does not exceed the parent node's `reg` range when mapped and defined.

### Fixed

- Stability improvements for multi-tab view usage.

## [0.3.1] - 2025-04-29

### Added

- Display node path on hover.
- Show DTS native type and binding type on hover for properties.
- LSP API to get actions for a location:
    - Generate C Identifier macros for nodes and properties.
    - Generate node path.
- Context menu options:
    - Copy C Identifiers to clipboard.
    - Copy node path to clipboard.

### Fixed

- High CPU usage due to constant context switching in split view.
- Performance degradation during LSP-based node resolution for completion/hover/etc.
- Unhandled error when context selection is aborted.
- Type checking on `nexusSpecifierMap` when Zephyr bindings were also loaded.

## [0.3.0] - 2025-04-19

### Added

- VS Code extension API support.
- On-hover over macro shows both decimal and hex values.
- `lockRenameEdits` added to context settings.
- VS Code commands:
    - Devicetree: Generate context output.
    - Devicetree: Set active context.

### Changed

- Renamed `lockRenameEdits` to `defaultLockRenameEdits` in root settings.

### Fixed

- Overlay file changes not being processed.
- Missing semantic tokens, syntax diagnostics, and document symbols for overlay files.
- Parsing issues with certain malformed Zephyr bindings or malformed node paths.
- Case sensitivity issues with the `setting` path on Windows.
- Byte string `toString` now outputs hex instead of decimal.
- Diagnostics disappearing when typing in files shared by multiple contexts.

## [0.2.5] - 2025-04-08

### Fixed

- Performance improvements

## [0.2.4] - 2025-04-06

### Added

- Resolve `${workspaceFolder}` to the top most workspace uri if used in the configuration paths.

### Fixed

- LSP not working on Windows Operating systems
- Issue with folding ranges not showing for content added as the below

```devicetree
/dts-v1/;
#include "nrf5340_cpuapp_common.dtsi" // -> OK

/ {
	model = "Nordic NRF5340 DK NRF5340 Application";
	compatible = "nordic,nrf5340-dk-nrf5340-cpuapp";

	chosen {
		#include "nrf5340_cpuapp_common.dtsi" // -> ISSUE Fixed
	};
};
```

## [0.2.3] - 2025-04-02

### Fixed

- Issue with folding ranges not showing in all context files

## [0.2.2] - 2025-04-01

### Added

- Support for `#IF`, `#ELIF`, `#ELSE`
- Auto completion of macros when assigning values

### Fixed

- Support inline eval of macros with `#` and `##` syntax
- Support onHover/getDefinition/getDeclaration on Macro param

### Changed

- Remove `required` property `device_type` for `memory` and `cpu` node

### Fixed

- Issue when `autoChangeContext` is true (default) and a file is usd by two or more context,
  the first created context would take precedence. Now the active content takes precedence if files
  is in it.

## [0.2.1] - 2025-03-23

### Added

- Folding ranges `#IFDEF/#IFNDEF ... #ELSE ... #END`

### Fixed

- Folding ranges for context with multiple dts files/overlays

## [0.2.0] - 2025-03-23

### Added

- Add support for `#udef`.
- OnHover on CMacros.
- Go to declaration/definition on CMacros in devicetree files.
- Check that root node has `cpus` node.
- Check that `aliases` node can only be added to root node.
- Check that `aliases` node property names follow the DTS Spec v0.4.
- Check that `aliases` node property values is string or phandle.
- Check that `aliases` node does not have any children.
- Check that `aliases` node property node path string resolves to actual node.
- `OnHover` on `aliases` node property with a string path will show resolved node state.
- Go to definition/declaration on `aliases` node property with path string.
- Find all references on `aliases` node property with path string.
- Check that `memory` node has both `device_type` and `reg` properties.
- Check that `reserved-memory` node has `#address-cells`, `#size-cells` and `ranges` properties.
- Check that `cpus` node has both `#address-cells` and `#size-cells`.
- Check that `cpus` property `#size-cells` has value of `0`.
- Check that `cpus` node has both `#address-cells` and `#size-cells`.
- Check that `cpu` node has both `device_type` and `reg` properties.

### Changed

- `device_type`
    - diagnostics will not show deprecated warning when required.
    - required for `cpus` node.

### Fixed

- Type completion suggestions. e.g. `status=` now correctly suggests values such as "Okay", "disabled", "fail".
- Stuttering when reporting diagnostics. This is clearly visible in the `Problems` tab in VSCode as when typing the
  diagnostics disappear and repaper after typing stops
- Performance improvement to avoid repassing unaffected documents
- Fix `find definitions`, `find declarations`, `find all references` for root nodes.
- Fix `go to definition`, `go to declarations`, `find all references` for root nodes.
- Node path name matching when node name with address but name is unique.
- Find reference on a delete node now also include the `/delete-node/ <nodeName>` for when delete is done by node name.
- Refactoring/renaming on a delete node now also refactors/renames the `/delete-node/ <nodeName>` for when delete is done by node name.

## [0.1.2] - 2025-03-13

### Added

- Hook '.dtso' file format in language server [Contribution by [SpieringsAE](https://github.com/SpieringsAE)]

## [0.1.1] - 2025-03-09

### Added

- File watchers for files used by contexts.

### Fixed

- onHover error on cretin properties when using linux bindings.
- Diagnostics when property is missing ';'. Now LSP does not assume ',' is missing if token is at end of line.
- Avoid re parsing when onDidChangeContent text content did not change from last state.
- Clean up diagnostics of all files when all files are closed
- Removing adHoc context from memory on all files closed.

## [0.1.0] - 2025-02-09

### Added

- Parser support for `prop = /bits/ 8 <10>;`
    - This syntax will be marked with a warning given it is not part of the v0.4 devicetree spec.
- Parser support for `/memreserve/ 0x0000a800 0x000f5800;`
- Experimental Support for devicetree-org json schema bindings
- Support for node names with comma separated addresses e.g.

```devicetree
node1@1,0 {}
```

### Changed

- `device_type`
    - diagnostics now always show depreciated warning.
    - no longer show `should be omitted` diagnostic

### Fixed

- Standard type `interrupt-map` no longer reports error if `#address-cells` is omitted and instead it will now default to 2
- Parser issue where `unknown syntax` diagnostic is reported for no apparent reason
- Issue with providing document symbol on startup
- Issue with providing semantic tokens on startup
- Issue with providing folding ranges on startup
- Clean up diagnostics from inactive context

## [0.0.9] - 2025-01-26

### Fixed

- Support for `/include/` syntax

## [0.0.8] - 2025-01-26

### Added

- Go to definition on document links to provide alternative to LSP clients with no DocumentLink support [User Feedback]

### Fixed

- Diagnostics cleared on each `onDidChangeContent` event before new diagnostics are generated.

## [0.0.7] - 2025-01-21

### Added

- Completion for Includes
- Diagnostic for Include when server is unable to resolve

### Fixed

- Disable `diagnostics.refresh` if Client does not support this. [Fixed by [topisani](https://github.com/topisani)]
- Invalid uri format in diagnostics when clearing workspace diagnostics `diagnostics.refresh`. [Fixed by [topisani](https://github.com/topisani)]
- Server crash if import is a directory
- Report diagnostics issues from CPreProcessor

## [0.0.6] - 2025-01-18

### Changed

- If enabled, ad hoc context can now be created for devicetree files such as 'dtsi' and 'overlay' files that

### Fixed

- 'File not in context' were not clearing in some cases

## [0.0.5] - 2025-01-15

### Added

- Support in parser to consider assigning macro to property as valid syntax

```devicetree
prop = FOO(10)
```

### Fixed

- Parsing error when macro function like calls have zero parameters e.g.

```devicetree
prop = FOO()
```

- Parsing error when macro function like calls have missing parameters after comma e.g.

```devicetree
prop = FOO(10,)
```

## [0.0.4] - 2025-01-14

### Fixed

- On Hover rendered Macro calls parameter as `[object object]` instead of the actual string value e.g

```devicetree
reg = <536870912 DT_SIZE_K([object object])>;  -> issue
reg = <536870912 DT_SIZE_K(448)>; -> fix
```

## [0.0.3] - 2025-01-13

### Added

- Formatting of comments
- Code action to add missing properties

### Fixed

- Formatting of includes statement in files that where included inside a DTC node

## [0.0.2] - 2025-01-10

### Added

- Support for `devicetree.cwd` in the setting. This can be used to allow relative paths in:
    - `devicetree.defaultIncludePaths`
    - `devicetree.defaultZephyrBindings`
- Support for `cwd` in each context. If this is missing `devicetree.cwd` will be used as fallback. This can be used to allow relative paths in:
    - `includePaths`
    - `zephyrBindings`
    - `dtsFile`
- `ctxName` to the context settings. This can be a string or a number.
- Extended `preferredContext` to support linking to `ctxName`. This can be a string or a number.
- `devicetree.autoChangeContext`. If true the LSP will auto change the active context for actions. Defaults to true.
- `devicetree.allowAdhocContexts` If true the LSP will create ad hoc context for when `.dts` file is opened and not in any `devicetree.contexts`. Defaults to true. If not context is available for a devicetree file a warning.
- Formatting `include` in document
- Formatting now support configuration of tab vs spaces and spaces size

### Fixed

- Parsing files with `include` that is not in the root of the document e.g.

```devicetree
/dts-v1/;
#include "nrf5340_cpuapp_common.dtsi" // -> OK

/ {
	model = "Nordic NRF5340 DK NRF5340 Application";
	compatible = "nordic,nrf5340-dk-nrf5340-cpuapp";

	chosen {
		#include "nrf5340_cpuapp_common.dtsi" // -> ISSUE Fixed
	};
};
```

## [0.0.1] - 2025-01-07

### Added

- First release
