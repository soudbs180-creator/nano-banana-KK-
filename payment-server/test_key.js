const crypto = require('crypto');
const appPublicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkViIWu4nglJCXjmJHNPxBUlXC4rnHNBGmHSdsaa0HkT2dJhxP3mBM0btB0ab3Rx/qhTTa69TSAGxYo7PjuZfuvNS9mE6zeac/PZ+do+2EHOjjXVXDhl7AJUelaDF9ojEdiTrpL1tBc9okdq2rg7QOmNV3UlZ3225Ueb4UKt65Pd7LZvieMTZ7JRatRAqBncuhZbzrB1rMeKK1Mco6eIwLxJWdFC36XFPnlWB+A0M+jRaAItAWShoL1p+vOT4TvED+cLAA7Kiu20+eNyqgMFXEX3XwndHzUeOfxuMeOqhYJxi1k+AJjW3t4mCKKqWoYk8sp0nbgV1poAUpKpvGXE1vwIDAQAB';
const appPrivateKeyEnv = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDUffoZipwPB4c6v/wwDG49qIh37unLnQxDzPODOw9IEQz5IbFkX+g2GD4AardZnEZDt1gOxK+dI4g1wmmaSZZpZnpJBOhpDSIOZdJRegvJR/VRgyFNNc6NTmS0lZwGKLGu4fIsHSdvN0qNKG1PwVAr+rmRkU5IsCG6+UUDGVd/9wHLXqEkyr2r8437ctxbEJgaV5baoR+gtXtkc6uYDjXPQCUBPObGo1BVlmMudw0hPGIutg5zMcwpJc70SAAOXtqH99mIDqXtRwqbjdip19vObkU+R79G5Q4D8dYLqW6mnVXzX0RJ0pIMwu+kl3cIeUJPEpeeTfD73vBTEfG4JKXjAgMBAAECggEBAMDadRqpSmn5kyonBGM3ZPZg9zqig15g8ri2UmxQNdZaY0PY6H8I7F/sMJmAQVf7FWpwBGOi7x/XF9By2hVFpFWUxHdxFN4DJV2b2/5GnlvYCzYnpRnGM+jbtVqQTkLovBrUxk5zR08RB4CFqHAyKuk/bRxInJwr/vELOy9M2LUxecD8+yUKTxATVCZbIGFk4lhVXl+xPhfde45id3CfFe3TT2YqiGwctttX9oLY5a2i143xMn/R6X4D34vcsT8DdOhqaejT5x6ebGEC0p1CjhEGj4K6U7qQF1eVpeUizLW8RAlEZf59rhig7UupyFWpLRBCmPOKlW3j8kcQzLn6yoECgYEA8Pdi+4kvxc1/0RbyQFCXNuXHudceJNN56wNryRkgxAwgf7yfsWEUesw6bjHVRPuW65rU85I9qx55l2qMKrd7xSLR5H1XpdKph6TIktTAg3rgRrw0dWWnAiwF3BOyA3AdBfe0IH7oQhGH20AkAxYH3u8pb/MkRaoe678VTKP6dxsCgYEA4b/PuoicJ9tGKp6KSlCflTWPzM8bsan1jK2dkaMEsSoRtnFvl7SFsmp6oK+Thlq0Ewg4j0m+r3Ohy2xqAGXGl3YpFJoQSDpExKCx1nICQivej+hmCOLYHr90KjIMwi9ncfGCYDU5hSa45vUIqbKH9rOvRR2iEqWer+6QRZZsENkCgYATphiMKkOa/YbOpfBbDjdGYrZGkSQEHLp0T3MaktH5KoP75oWfESt6V+zrz2R0m49S5u02b1ZX/cQsdKO5V/zftlcnKpFbFDJ+vREd5/tKvVpMakxcxk04AB76MyDw5tN3CRvHCpIl0Qgi+Lf3CHTb2OSoHEt44sZistIpzbU+wQKBgCV5UMNXMAzRsnkarjwd3A/Jv2AxNRit7Ov4WgK1++5o3F3bwLl/Jv5x/H82Bhg0cFYEdFcc18GKQV5iVcpRGsFDxRf9ZxyGR6oYPs0pScSwQZbD7kQlW9jm0SK8AjAt7E8W1xyfWTgIMINuQ4zf7P//3eVsQN41jf0IbfyPNsspAoGAVZOi984LKxUM/xCB6bxcs72h92NTEys5ME/9X3B/cGVeSqu3t7KzKJKB+HofObeeCiWfKB8YkpmBC7reM3b+3pOA74QoqxywXtk96zlM7+7MLT/Is6XmIbh5srkSB1agwJozfEsR+gUM6WdCJCY77N0PMjVVgPosfurYmZO9vvw=';

function formatPubKey(key) {
    const chunks = key.match(/.{1,64}/g).join('\n');
    return '-----BEGIN PUBLIC KEY-----\n' + chunks + '\n-----END PUBLIC KEY-----';
}
function formatPrivKey(key) {
    const chunks = key.match(/.{1,64}/g).join('\n');
    return '-----BEGIN RSA PRIVATE KEY-----\n' + chunks + '\n-----END RSA PRIVATE KEY-----';
}

try {
    const pub = crypto.createPublicKey(formatPubKey(appPublicKey));
    const priv = crypto.createPrivateKey(formatPrivKey(appPrivateKeyEnv));

    const derivedPub = crypto.createPublicKey(priv);

    if (pub.export({ format: "pem", type: "spki" }) === derivedPub.export({ format: "pem", type: "spki" })) {
        console.log("MATCH: Private Key matches Application Public Key!");
    } else {
        console.log("MISMATCH: Private Key does NOT match Application Public Key!");
    }
} catch (e) {
    console.log("ERROR: ", e.message);
}
