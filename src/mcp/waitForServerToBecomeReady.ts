import * as http from 'node:http'

export async function waitForServerToBecomeReady(port: number): Promise<void> {
  for (let iteration = 0; iteration <= 10; iteration += 1) {
    const statusCode = await ping(port)

    if (statusCode === 200) {
      console.debug('MCP server is ready and takes requests!')
      return
    }
    if (iteration < 10) {
      console.debug('MCP server not ready yet, waiting 1 second before retrying...')
      await new Promise<void>((r) => {
        setTimeout(r, 1000)
      })
    }
  }
  throw new Error('MCP server not ready after 10 attempts')
}

async function ping(port: number): Promise<number | undefined> {
  return await new Promise<number | undefined>((resolve) => {
    const req = http.request(`http://localhost:${port.toString()}/ping`, { method: 'GET', timeout: 1000 }, (res) => {
      resolve(res.statusCode)
    })

    req.on('socket', function (socket) {
      socket.setTimeout(1000)
      socket.on('timeout', function () {
        req.destroy()
      })
    })

    req.on('error', function (err) {
      console.debug('MCP server not ready yet, error connecting', err)
      resolve(undefined)
    })

    req.end()
  })
}
