const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Manual blacklist of exact package names to ignore (removes their dependencies too)
const blacklist = [
	'@jest/globals',
	'@tsconfig/node20',
	'@types/jest',
	'@types/node',
	'jest',
	'license-checker',
	'vscode-languageserver-types',
	'typescript',
	'ts-jest',
	// Add more packages here if needed
];

async function main() {
	const ctx = await esbuild.context({
		entryPoints: ['server/src/server.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: !production,
		platform: 'node',
		outfile: 'server/dist/server.js',
		external: [],
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	if (watch) {
		await ctx.watch();
	} else {
		const result = await ctx.rebuild();
		await generateLicensesWithTempDeps(); // Generate license file after build
		await ctx.dispose();
	}
}

/**
 * Generate THIRD_PARTY_LICENSES.txt excluding blacklisted packages and their dependencies
 */
function generateLicensesWithTempDeps() {
	const pkgPath = path.join(__dirname, 'package.json');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

	// 1. Move allowed devDependencies to dependencies temporarily
	const allowedDevDeps = {};
	for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
		if (!blacklist.includes(name)) {
			allowedDevDeps[name] = version;
		}
	}
	pkg.dependencies = pkg.dependencies || {};
	Object.assign(pkg.dependencies, allowedDevDeps);

	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t'));

	try {
		// 2. Run license-checker on production dependencies only
		execSync(
			'npx license-checker --json --production > .licenses.tmp.json',
			{
				stdio: 'inherit',
				cwd: __dirname,
			},
		);
	} finally {
		// 3. Restore original package.json
		delete pkg.dependencies; // Remove temporary dependencies
		fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t'));
	}

	// 4. Read licenses
	const licenses = JSON.parse(
		fs.readFileSync(path.join(__dirname, '.licenses.tmp.json'), 'utf8'),
	);
	fs.unlinkSync(path.join(__dirname, '.licenses.tmp.json'));

	// 5. Build THIRD_PARTY_LICENSES.txt
	let output = 'THIRD-PARTY LICENSES\n\n';
	for (const [pkgName, info] of Object.entries(licenses)) {
		output += `${pkgName}\n`;
		output += `License: ${info.licenses}\n`;
		if (info.repository) output += `Repository: ${info.repository}\n`;
		if (info.licenseText) output += `\n${info.licenseText.trim()}\n`;
		output += '\n' + '-'.repeat(70) + '\n\n';
	}

	// 6. Write to server/dist/THIRD_PARTY_LICENSES.txt
	const outFile = path.join(__dirname, 'dist/THIRD_PARTY_LICENSES.txt');
	fs.mkdirSync(path.dirname(outFile), { recursive: true });
	fs.writeFileSync(outFile, output, 'utf8');
	console.log(`✅ THIRD_PARTY_LICENSES.txt written to ${outFile}`);
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',
	setup(build) {
		build.onStart(() => console.log('[watch] build started'));
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(
						`    ${location.file}:${location.line}:${location.column}:`,
					);
				}
			});
			console.log('[watch] build finished');
		});
	},
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
