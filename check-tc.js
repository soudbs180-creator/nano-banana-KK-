import fs from 'fs';
import path from 'path';
import * as OpenCC from 'opencc-js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const converter = OpenCC.Converter({ from: 'twp', to: 'cn' });

function autoFixFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    let hasChanges = false;

    // Since we know the Traditional Characters, we can safely just convert the whole file content.
    const simplified = converter(code);
    if (simplified !== code) {
        fs.writeFileSync(filePath, simplified, 'utf-8');
        hasChanges = true;
    }

    return hasChanges;
}

function traverse(dir, callback) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fullPath.includes('node_modules') || fullPath.includes('.git')) continue;
        if (fs.statSync(fullPath).isDirectory()) {
            traverse(fullPath, callback);
        } else {
            if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.json')) {
                callback(fullPath);
            }
        }
    }
}

let fixedCount = 0;
traverse(path.join(__dirname, 'src'), (file) => {
    if (autoFixFile(file)) {
        fixedCount++;
        console.log('Fixed:', file.replace(__dirname, ''));
    }
});

console.log(`\nFinished! Total files fixed: ${fixedCount}`);
