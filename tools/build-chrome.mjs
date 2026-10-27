import { build } from 'wxt'

// The upstream Windows CLI leaves dependency handles open after its final
// "Finished" message. Await WXT's public build API, then exit only after its
// complete result and stdout have been flushed. Build failures stay nonzero.
try {
  await build({ browser: 'chrome' })
  await new Promise((resolve) =>
    process.stdout.write('\nChrome build API resolved successfully.\n', resolve),
  )
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
