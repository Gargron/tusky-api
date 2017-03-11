import WebSocket from 'ws'
import express from 'express'
import axios from 'axios'

const app = express()
const serverKey = process.env.SERVER_KEY || ''
const wsStorage = {}

const notificationToData = notification => ({
  title: notification.type,
  body: notification.status ? notification.status.content : notification.account.acct
})

const connectForUser = (baseUrl, accessToken, deviceToken) => {
  console.log(`New connection for ${baseUrl}: ${deviceToken}`)

  const ws = new WebSocket(`${baseUrl}/api/v1/streaming/?access_token=${accessToken}&stream=user`)

  wsStorage[`${baseUrl}:${accessToken}`] = ws;

  ws.on('message', data => {
    const json = JSON.parse(data)

    console.log(`New notification for ${deviceToken}: ${json.event}`)

    if (json.event !== 'notification') {
      return
    }

    const firebaseMessage = {
      registration_ids: [deviceToken],
      priority: 'high',
      data: notificationToData(json.payload)
    }

    axios.post('https://fcm.googleapis.com/fcm/send', JSON.stringify(firebaseMessage), {
      headers: {
        Authorization: `key=${serverKey}`
      }
    })
  })
}

const disconnectForUser = (baseUrl, accessToken) => {
  const ws = wsStorage[`${baseUrl}:${accessToken}`]
  ws.close()
  delete wsStorage[`${baseUrl}:${accessToken}`]
}

app.get('/', (req, res) => {
  res.sendStatus(204)
})

app.post('/register', (req, res) => {
  connectForUser(req.params.instance_url, req.params.access_token, req.params.device_token)
  res.sendStatus(201)
})

app.post('/unregister', (req, res) => {
  disconnectForUser(req.params.instance_url, req.params.access_token)
  res.sendStatus(201)
})

app.listen(3000, () => {
  console.log('Listening on port 3000')
})
