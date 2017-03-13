import WebSocket from 'ws'
import express from 'express'
import axios from 'axios'
import bodyParser from 'body-parser'
import npmlog from 'npmlog'
import morgan from 'morgan'
import Sequelize from 'sequelize'

const app       = express()
const serverKey = process.env.SERVER_KEY || ''
const port      = process.env.PORT || 3000
const wsStorage = {}
const sequelize = new Sequelize('sqlite://tusky.sqlite', {
  logging: npmlog.verbose,
  storage: 'db/tusky.sqlite'
})

const connectForUser = (baseUrl, accessToken, deviceToken) => {
  const log = (level, message) => npmlog.log(level, `${baseUrl}:${deviceToken}`, message)

  if (typeof wsStorage[`${baseUrl}:${accessToken}`] !== 'undefined') {
    log('info', 'Already registered')
    return
  }

  let heartbeat

  log('info', 'New registration')

  const close = () => {
    clearInterval(heartbeat)
    disconnectForUser(baseUrl, accessToken)
  }

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

      if (response.data.failure === 0 && response.data.canonical_ids === 0) {
        return
      }

      response.data.results.forEach(result => {
        if (result.message_id && result.registration_id) {
          Registration.findOne({ where: { instanceUrl: baseUrl, accessToken: accessToken }}).then(registration => registration.update({ deviceToken: result.registration_id }))
        } else if (result.error === 'NotRegistered') {
          close()
        }
      })
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
      clearInterval(heartbeat)
      close()
      return
    }

    log('error', `Unexpected close: ${code}`)
    setTimeout(() => reconnect(), 5000)
  }

  const reconnect = () => {
    clearInterval(heartbeat)

    const ws = new WebSocket(`${baseUrl}/api/v1/streaming/?access_token=${accessToken}&stream=user`)

    ws.on('open', () => {
	  if (ws.readyState != 1) {
		log('error', `Client state is: ${ws.readyState}`)  
	  }
	  else {
		log('info', 'Connected')
		heartbeat = setInterval(() => ws.ping(), 1000)
	  }

    })

    ws.on('message', onMessage)
    ws.on('error', onError)
    ws.on('close', onClose)

    wsStorage[`${baseUrl}:${accessToken}`] = ws;
  }

  reconnect()
}

const disconnectForUser = (baseUrl, accessToken) => {
  Registration.findOne({ where: { instanceUrl: baseUrl, accessToken: accessToken }}).then((registration) => {
	  if (registration != null) {
		registration.destroy()
	  }
	  })
  const ws = wsStorage[`${baseUrl}:${accessToken}`]
  if (typeof ws !== 'undefined') {
	    ws.close()
		delete wsStorage[`${baseUrl}:${accessToken}`]
  }
}

const Registration = sequelize.define('registration', {
  instanceUrl: {
    type: Sequelize.STRING
  },

  accessToken: {
    type: Sequelize.STRING
  },

  deviceToken: {
    type: Sequelize.STRING
  }
})

Registration.sync()
  .then(() => Registration.findAll())
  .then(registrations => registrations.forEach(registration => {
    connectForUser(registration.instanceUrl, registration.accessToken, registration.deviceToken)
  }))

app.use(morgan('combined'));
app.use(bodyParser.urlencoded({ extended: true }))

app.get('/', (req, res) => {
  res.sendStatus(204)
})

app.post('/register', (req, res) => {
  Registration.findOrCreate({ where: { instanceUrl: req.body.instance_url, accessToken: req.body.access_token, deviceToken: req.body.device_token }})
  connectForUser(req.body.instance_url, req.body.access_token, req.body.device_token)
  res.sendStatus(201)
})

app.post('/unregister', (req, res) => {
  disconnectForUser(req.body.instance_url, req.body.access_token)
  res.sendStatus(201)
})

app.listen(port, () => {
  npmlog.log('info', `Listening on port ${port}`)
})
