# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

# 0.1.1 - 2025-03-09

### Added

- File watchers for files used by contexts.

### Fixed

- On hover error on certin properties when using linux bindings.
- Diagnostics when property is missing ';'. Now code does not assume ',' is missing if token is at end of line.
- Avoid reparsing when onDidChangeContent text content did not change from last state.

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
  - diagnostics now always show depricated warning.
  - no longer show `should be ommited` diagnostic

### Fixed

- Standard type `interrupt-map` no longer reports error if `#address-cells` is omitted and instead it will now default to 2
- Parser issue where `unknown syntax` diagnostic is reported for no apparent reason
- Issue with providing document symbol on startup
- Issue with providing semantic tokens on startup
- Issue with providing folding ranges on startup
- Clean up diagnostics from inactive context
- Clean up diagnostics of all file when all files are closed
- Removing adHoc from memory on all files closed.

# 0.0.9 - 2025-01-26

### Fixed

- Support for `/include/` syntax

# 0.0.8 - 2025-01-26

### Added

- Go to definition on document links to proide alternative to LSP clients with no DocumentLink support [User Feedback]

### Fixed

- Diagnosting cleared on each `onDidChangeContent` event before new diagnostics are generated.

# 0.0.7 - 2025-01-21

### Added

- Completion for Includes
- Diagnostic for Include when server is unable to resolve

### Fixed

- Disable `diagnostics.refresh` if Client does not support this. [Fixed by [topisani](https://github.com/topisani)]
- Invalid uri format in diagnostics when clearing workspace diagnostics `diagnostics.refresh`. [Fixed by [topisani](https://github.com/topisani)]
- Server crash if import is a directory
- Report diagnostics issues from CPrePorcessor

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

- On Hover rendered Macro calls parametes as `[object object]` instead of the actual string value e.g

```devicetree
reg = <536870912 DT_SIZE_K([object object])>;  -> issue
reg = <536870912 DT_SIZE_K(448)>; -> fix
```

## 0.0.3 - 2025-01-13

### Added

- Formating of comments
- Code action to add missing properties

### Fixed

- Formating of includes statment in files that where included inside a DTC node

## 0.0.2 - 2025-01-10

### Added

- Support for `devicetree.cwd` in the setting. This can be used to allow relative paths in:
  - `devicetree.defaultIncludePaths`
  - `devicetree.defaultZephyrBindings`
- Support for `cwd` in each context. If this is missing `devicetree.cwd` will be used as falback. This can be used to allow relative paths in:
  - `includePaths`
  - `zephyrBindings`
  - `dtsFile`
- `ctxName` to the context settings. This can be a string or a number.
- Extended `preferredContext` to support linking to `ctxName`. This can be a string or a number.
- `devicetree.autoChangeContext`. If true the LSP will auto change the active context for actions. Defaults to true.
- `devicetree.allowAdhocContexts` If true the LSP will create ad hoc context for when `.dts` file is opned and not in any `devicetree.contexts`. Defaults to true. If not context is avalable for a devicetree file a warning.
- Formating `include` in document
- Formating now support confiuration of tab vs spaces and spaces size

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
