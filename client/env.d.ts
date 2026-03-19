/// <reference types="vite/client" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

declare module 'tweetnacl' {
    interface BoxKeyPair {
        publicKey: Uint8Array
        secretKey: Uint8Array
    }

    interface Box {
        (message: Uint8Array, nonce: Uint8Array, publicKey: Uint8Array, secretKey: Uint8Array): Uint8Array
        open(
            box: Uint8Array,
            nonce: Uint8Array,
            publicKey: Uint8Array,
            secretKey: Uint8Array,
        ): Uint8Array | null
        keyPair: {
            (): BoxKeyPair
            fromSecretKey(secretKey: Uint8Array): BoxKeyPair
        }
        nonceLength: number
    }

    const nacl: {
        randomBytes(length: number): Uint8Array
        box: Box
    }

    export default nacl
}
