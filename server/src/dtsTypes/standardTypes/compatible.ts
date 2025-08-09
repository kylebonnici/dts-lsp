/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BindingPropertyType } from '../../types/index';
import { PropertyNodeType } from '../types';
import { generateOrTypeObj } from './helpers';

export default () => {
	const prop = new PropertyNodeType(
		'compatible',
		generateOrTypeObj(BindingPropertyType.STRINGLIST),
	);
	prop.description = [
		`The compatible property value consists of one or more strings that define the specific programming model for the device. This list of strings should be used by a client program for device driver selection. The property value consists of a concatenated list of null terminated strings, from most specific to most general. They allow a device to express its compatibility with a family of similar devices, potentially allowing a single device driver to match against several devices.`,
		`The recommended format is "manufacturer, model", where manufacturer is a string describing the name of the manufacturer (such as a stock ticker symbol), and model specifies the model number.`,
		`The compatible string should consist only of lowercase letters, digits and dashes, and should start with a letter. A single comma is typically only used following a vendor prefix. Underscores should not be used.`,
	];
	prop.examples = [
		'```devicetree\ncompatible = "fsl,mpc8641", "ns16550";\n```',
		`In this example, an operating system would first try to locate a device driver that supported fsl, mpc8641. If a driver was not found, it would then try to locate a driver that supported the more general ns 16550 device type.`,
	];
	return prop;
};
