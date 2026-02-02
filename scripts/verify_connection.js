import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env manually
const envPath = path.resolve(process.cwd(), '.env');
console.log(`Reading .env from: ${envPath}`);

if (!fs.existsSync(envPath)) {
    console.error("❌ .env file not found!");
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        env[key] = value;
    }
});

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error("❌ Missing URL or Key in .env");
    console.log("Current Env:", env);
    process.exit(1);
}

console.log(`Connecting to: ${url}`);
// Mask key for log
console.log(`Using Key: ${key.substring(0, 10)}...`);

const supabase = createClient(url, key);

async function test() {
    console.log("\n--- Testing Database ---");
    try {
        // Test Table Existence via Select (RLS should return 0 rows, not error)
        const { count, error } = await supabase
            .from('user_canvases')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error("❌ Query Error:", error.message);
            console.error("   (Code: " + error.code + ")");
            if (error.code === '42P01') {
                console.error("   Reason: Table 'user_canvases' DOES NOT EXIST. Please run the migration script!");
            }
        } else {
            console.log("✅ Table 'user_canvases' access response received.");
            console.log("   (RLS is active, so 0 rows expected for unauthenticated user)");
            console.log("   Status: Operational");
        }

    } catch (e) {
        console.error("❌ Unexpected DB Error:", e.message);
    }

    console.log("\n--- Testing Storage ---");
    try {
        // Try to access the bucket. Note: 'list' works if policy allows public read or we are owner.
        // We set 'public' to true, so public URL access works, but API listing might be restricted.
        // Let's rely on the DB test mainly, but this is a bonus.
        // We can't list buckets easily with Anon, but we can try to list files in the bucket.
        const { data, error } = await supabase.storage.from('generated-images').list();

        if (error) {
            console.log("ℹ️  Storage check limited (Normal for anon key):", error.message);
            // If error is "Bucket not found", that's critical.
            if (error.message.includes("not found")) {
                console.error("❌ Bucket 'generated-images' NOT FOUND.");
            }
        } else {
            console.log("✅ Bucket 'generated-images' is accessible.");
        }

    } catch (e) {
        console.error("❌ Storage Error:", e.message);
    }
}

test();
