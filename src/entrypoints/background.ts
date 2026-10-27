import { defineProxy } from 'comctx'

import { defineBackground } from '#imports'
import { BackgroundCounter, ProvideBackgroundAdapter } from '@/message/background'
import { installFollowupRpc } from '@/followup/privateBackground'

export default defineBackground({
  main() {
    installFollowupRpc()
    const [provideBackgroundCounter] = defineProxy(() => new BackgroundCounter(), {
      namespace: '__boss-helper-background__',
    })

    provideBackgroundCounter(new ProvideBackgroundAdapter())
  },
})
