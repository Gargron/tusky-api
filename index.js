import WebSocket from 'ws'
import express from 'express'
import axios from 'axios'
import bodyParser from 'body-parser'

const app = express()
const serverKey = process.env.SERVER_KEY || ''
const wsStorage = {}

const notificationToData = notification => {
  switch(notification.type) {
  case 'mention':
    return { title: `${notification.account.acct} mentioned you`, body: notification.status.content }
  case 'follow':
    return { title: 'New follower', body: notification.account.acct }
  case 'reblog':
    return { title: `${notification.account.acct} boosted your toot`, body: notification.status.content }
  case 'favourite':
    return { title: `${notification.account.acct} favourited your toot`, body: notification.status.content }
  }
}

const connectForUser = (baseUrl, accessToken, deviceToken) => {
  if (typeof wsStorage[`${baseUrl}:${accessToken}`] !== 'undefined') {
    console.log(`Already registered ${baseUrl}: ${deviceToken}`)
    return
  }

  console.log(`New connection for ${baseUrl}: ${deviceToken}`)

  const ws = new WebSocket(`${baseUrl}/api/v1/streaming/?access_token=${accessToken}&stream=user`)

  wsStorage[`${baseUrl}:${accessToken}`] = ws;

  ws.on('message', data => {
    const json = JSON.parse(data)

    console.log(`New notification for ${deviceToken}: ${json.event}`)

    if (json.event !== 'notification') {
      return
    }

    const payload = JSON.parse(json.payload)

    const firebaseMessage = {
      to: deviceToken,
      priority: 'high',
      notification: notificationToData(payload),
      data: { notification_id: payload.id }
    }

    axios.post('https://fcm.googleapis.com/fcm/send', JSON.stringify(firebaseMessage), {
      headers: {
        'Authorization': `key=${serverKey}`,
        'Content-Type': 'application/json'
      }
    }).then(response => {
      console.log(`Sent to FCM, status ${response.status}: ${JSON.stringify(response.data)}`)
    }).catch(error => {
      console.error(`Error sending to FCM, status: ${error.response.status}: ${JSON.stringify(error.response.data)}`)
    })
  })
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
