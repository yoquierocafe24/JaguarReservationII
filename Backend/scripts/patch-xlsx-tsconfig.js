const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, '..', 'node_modules', 'xlsx', 'types', 'tsconfig.json');
const backup = dest + '.bak';

const content = {
    compilerOptions: {
        module: 'commonjs',
        target: 'es5',
        lib: ['es5'],
        moduleResolution: 'node',
        esModuleInterop: true,
        skipLibCheck: true,
        noImplicitAny: true,
        noImplicitThis: true,
        strictNullChecks: false,
        baseUrl: '.',
        paths: { xlsx: ['.'] },
        types: [],
        noEmit: true,
        strictFunctionTypes: true,
        forceConsistentCasingInFileNames: true
    }
};

try {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(dest) && !fs.existsSync(backup)) {
        fs.copyFileSync(dest, backup);
        console.log('Backup creado en', backup);
    }

    fs.writeFileSync(dest, JSON.stringify(content, null, 4), 'utf8');
    console.log('tsconfig parcheado en', dest);
} catch (err) {
    console.error('No fue posible parchear tsconfig:', err.message);
    process.exitCode = 1;
}
