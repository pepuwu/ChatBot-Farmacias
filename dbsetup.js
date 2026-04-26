#!/usr/bin/env node

import { spawn } from 'node:child_process'

const env = { ...process.env }

try {
  await exec('npx prisma migrate deploy')
  await exec(process.argv.slice(2).join(' '))
} catch (err) {
  console.error(err?.message ?? err)
  process.exit(1)
}

function exec(command) {
  const child = spawn(command, { shell: true, stdio: 'inherit', env })
  return new Promise((resolve, reject) => {
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} failed rc=${code}`))
      }
    })
  })
}
