import WebSocket from 'ws'
import express from 'express'
import axios from 'axios'
import bodyParser from 'body-parser'
import npmlog from 'npmlog'

const app = express()
const serverKey = process.env.SERVER_KEY || ''
const wsStorage = {}

const connectForUser = (baseUrl, accessToken, deviceToken) => {
  const log = (level, message) => npmlog.log(level, `${baseUrl}:${accessToken}`, message)

  if (typeof wsStorage[`${baseUrl}:${accessToken}`] !== 'undefined') {
    log('info', `Already registered: ${deviceToken}`)
    return
  }

  log('info', `New registration: ${deviceToken}`)

  const onMessage = data => {
    const json = JSON.parse(data)

    log('info', `New notification: ${json.event}`)

    if (json.event !== 'notification') {
      return
    }

    const payload = JSON.parse(json.payload)

    const firebaseMessage = {
      to: deviceToken,
      priority: 'high',
      data: { notification_id: payload.id }
    }

    axios.post('https://fcm.googleapis.com/fcm/send', JSON.stringify(firebaseMessage), {
      headers: {
        'Authorization': `key=${serverKey}`,
        'Content-Type': 'application/json'
      }
    }).then(response => {
      log('info', `Sent to FCM, status ${response.status}: ${JSON.stringify(response.data)}`)
    }).catch(error => {
      log('error', `Error sending to FCM, status: ${error.response.status}: ${JSON.stringify(error.response.data)}`)
    })
  }

  const onError = error => {
    log('error', error)
    setTimeout(() => reconnect(), 5000)
  }

  const onClose = code => {
    if (code === 1000) {
      log('info', 'Remote server closed connection')
      return
    }

    log('error', `Unexpected close: ${code}`)
    setTimeout(() => reconnect(), 5000)
  }

  const reconnect = () => {
    const ws = new WebSocket(`${baseUrl}/api/v1/streaming/?access_token=${accessToken}&stream=user`)

    ws.on('open', () => log('info', 'Connected'))
    ws.on('message', onMessage)
    ws.on('error', onError)
    ws.on('close', onClose)

    wsStorage[`${baseUrl}:${accessToken}`] = ws;
  }

  reconnect()
}

const disconnectForUser = (baseUrl, accessToken) => {
  const ws = wsStorage[`${baseUrl}:${accessToken}`]
  ws.close()
  delete wsStorage[`${baseUrl}:${accessToken}`]
}

app.use(bodyParser.urlencoded({ extended: true }))

app.get('/', (req, res) => {
  res.sendStatus(204)
})

app.post('/register', (req, res) => {
  connectForUser(req.body.instance_url, req.body.access_token, req.body.device_token)
  res.sendStatus(201)
})

app.post('/unregister', (req, res) => {
  disconnectForUser(req.body.instance_url, req.body.access_token)
  res.sendStatus(201)
})

app.listen(3000, () => {
  console.log('Listening on port 3000')
})
