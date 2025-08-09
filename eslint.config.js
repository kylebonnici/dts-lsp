import { Linter } from 'eslint';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import importPlugin from 'eslint-plugin-import';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';

const recommendedTSRules = tsPlugin.configs.recommended.rules;

/** @type {Linter.Config[]} */
export default [
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
			},
		},
		plugins: {
			'@typescript-eslint': tsPlugin,
			prettier: prettierPlugin,
			'simple-import-sort': simpleImportSortPlugin,
			import: importPlugin,
			'unused-imports': unusedImportsPlugin,
		},
		rules: {
			...recommendedTSRules,

			semi: ['error', 'always'],
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',

			'prettier/prettier': 'error',

			'simple-import-sort/exports': 'warn',

			// Optionally, you can also disable the default ESLint import sorting rules if any
			'import/order': 'warn',

			'unused-imports/no-unused-imports': 'error',
			'unused-imports/no-unused-vars': [
				'warn',
				{
					vars: 'all',
					varsIgnorePattern: '^_',
					args: 'after-used',
					argsIgnorePattern: '^_',
				},
			],
		},
	},
];
