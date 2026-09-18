#!/usr/bin/env node
import { rebuild } from '@electron/rebuild'
import * as fs from 'fs'
import * as path from 'path'
import * as vars from './vars.mjs'

import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))


if (process.platform === 'win32' || process.platform === 'linux') {
    process.env.ARCH = ((process.env.ARCH || process.arch) === 'arm') ? 'armv7l' : process.env.ARCH || process.arch
} else {
    process.env.ARCH ??= process.arch
}

// The rebuild wipes node-pty's build/Release, including the conpty.dll + OpenConsole.exe
// that its postinstall script placed next to conpty.node - put them back
function restoreBundledConPTY () {
    const nodePTY = path.resolve(__dirname, '../app/node_modules/node-pty')
    const conptyRoot = path.join(nodePTY, 'third_party/conpty')
    const release = path.join(nodePTY, 'build/Release')
    if (process.platform !== 'win32' || !fs.existsSync(conptyRoot) || !fs.existsSync(release)) {
        return
    }
    const arch = process.env.ARCH === 'arm64' ? 'arm64' : 'x64'
    for (const version of fs.readdirSync(conptyRoot)) {
        const source = path.join(conptyRoot, version, `win10-${arch}`)
        if (fs.existsSync(source)) {
            fs.cpSync(source, path.join(release, 'conpty'), { recursive: true })
            console.info('Restored bundled ConPTY', version, arch)
        }
    }
}

let lifecycles = []
for (let dir of ['app', 'tabby-core', 'tabby-local', 'tabby-ssh', 'tabby-terminal']) {
    const build = rebuild({
        buildPath: path.resolve(__dirname, '../' + dir),
        electronVersion: vars.electronVersion,
        arch: process.env.ARCH,
        force: true,
    })
    if (dir === 'app') {
        build.then(restoreBundledConPTY)
    }
    build.catch(e => {
        console.error(e)
        process.exit(1)
    })
    lifecycles.push([build.lifecycle, dir])
}

console.info('Building against Electron', vars.electronVersion)

for (let [lc, dir] of lifecycles) {
    lc.on('module-found', name => {
        console.info('Rebuilding', dir + '/' + name)
    })
}
