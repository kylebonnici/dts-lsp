# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

# 0.2.6 - Unreleased

### Fixed

- No semantic tokens for overlays files
- No syntax diagnostics for overlays files
- No document symbols for overlays files
- Exception when parsing zephyr binding with no include property

# 0.2.5 - 2025-04-08

### Fixed

- Performance improvements

# 0.2.4 - 2025-04-06

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

# 0.2.3 - 2025-04-02

### Fixed

- Issue with folding ranges not showing in all context files

# 0.2.2 - 2025-04-01

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

# 0.2.1 - 2025-03-23

### Added

- Folding ranges `#IFDEF/#IFNDEF ... #ELSE ... #END`

### Fixed

- Folding ranges for context with multiple dts files/overlays

# 0.2.0 - 2025-03-23

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

# 0.1.2 - 2025-03-13

### Added

- Hook '.dtso' file format in language server [Contribution by [SpieringsAE](https://github.com/SpieringsAE)]

# 0.1.1 - 2025-03-09

### Added

- File watchers for files used by contexts.

### Fixed

- onHover error on cretin properties when using linux bindings.
- Diagnostics when property is missing ';'. Now LSP does not assume ',' is missing if token is at end of line.
- Avoid re parsing when onDidChangeContent text content did not change from last state.
- Clean up diagnostics of all files when all files are closed
- Removing adHoc context from memory on all files closed.

# 0.1.0 - 2025-02-09

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

# 0.0.9 - 2025-01-26

### Fixed

- Support for `/include/` syntax

# 0.0.8 - 2025-01-26

### Added

- Go to definition on document links to provide alternative to LSP clients with no DocumentLink support [User Feedback]

### Fixed

- Diagnostics cleared on each `onDidChangeContent` event before new diagnostics are generated.

# 0.0.7 - 2025-01-21

### Added

- Completion for Includes
- Diagnostic for Include when server is unable to resolve

### Fixed

- Disable `diagnostics.refresh` if Client does not support this. [Fixed by [topisani](https://github.com/topisani)]
- Invalid uri format in diagnostics when clearing workspace diagnostics `diagnostics.refresh`. [Fixed by [topisani](https://github.com/topisani)]
- Server crash if import is a directory
- Report diagnostics issues from CPreProcessor

# 0.0.6 - 2025-01-18

### Changed

- If enabled, ad hoc context can now be created for devicetree files such as 'dtsi' and 'overlay' files that

### Fixed

- 'File not in context' were not clearing in some cases

# 0.0.5 - 2025-01-15

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

## 0.0.4 - 2025-01-14

### Fixed

- On Hover rendered Macro calls parameter as `[object object]` instead of the actual string value e.g

```devicetree
reg = <536870912 DT_SIZE_K([object object])>;  -> issue
reg = <536870912 DT_SIZE_K(448)>; -> fix
```

## 0.0.3 - 2025-01-13

### Added

- Formatting of comments
- Code action to add missing properties

### Fixed

- Formatting of includes statement in files that where included inside a DTC node

## 0.0.2 - 2025-01-10

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

## 0.0.1 - 2025-01-07

### Added

- First release
