interface WebPushVapidGenerator {
  generateVAPIDKeys: () => {
    privateKey: string
    publicKey: string
  }
}

const webPushModule = await import('web-push') as unknown as WebPushVapidGenerator & {
  default?: WebPushVapidGenerator
}
const generateVAPIDKeys = webPushModule.generateVAPIDKeys ?? webPushModule.default?.generateVAPIDKeys

if (!generateVAPIDKeys) {
  throw new Error('web-push module does not expose generateVAPIDKeys.')
}

const keys = generateVAPIDKeys()

console.log('VAPID keys for Rybolov Cetin Web Push:')
console.log(`NUXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`RYBOLOV_VAPID_PRIVATE_KEY=${keys.privateKey}`)
