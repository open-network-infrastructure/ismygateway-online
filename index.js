require('now-env')
const { send } = require('micro')
const fetch = require('node-fetch')
const url = require('url')
const assert = require('assert')

const NOC_API_URL = 'http://noc.thethingsnetwork.org:8085/api/v2/gateways/'
const UPTIME_ROBOT_NEW_MONITOR = 'https://api.uptimerobot.com/v2/newMonitor'
const THRESHOLD_IN_SECONDS = 60 * 3

function getGatewayStatusUrl (gatewayEui) {
  return NOC_API_URL + gatewayEui
}

async function newMonitor (gatewayEui, uptimeRobotApi) {
  assert.ok(gatewayEui, 'Missing Gateway EUI')
  assert.ok(uptimeRobotApi, 'Missing UptimeRobot API key')

  const params = new url.URLSearchParams()
  params.append('api_key', uptimeRobotApi)
  params.append('format', 'json')
  params.append('type', '1')
  params.append('url', 'https://ismygateway.online/?eui=' + gatewayEui)
  params.append('friendly_name', 'TTN GW: ' + gatewayEui)

  const response = await fetch(UPTIME_ROBOT_NEW_MONITOR, { method: 'POST', body: params })
  return response.json()
}

async function checkGateway (gatewayEui) {
  const response = await fetch(getGatewayStatusUrl(gatewayEui))
  const json = await response.json()
  return json
}

module.exports = async (request, response) => {
  if (request.url === '/favicon.ico') {
    return send(response, 404)
  }

  const query = url.parse(request.url, true).query

  try {
    if (request.method === 'POST') {
      const result = await newMonitor(query.eui, query.key)
      if (result.stat === 'ok') {
        return send(response, 200, { message: 'Great success! Monitor created on uptimerobot.com' })
      }
      console.log(result)
      return send(response, 500, { message: 'Could not complete the monitor creation, check the logs' })
    }

    const result = await checkGateway(query.eui)
    const lastSeen = parseInt(result.time / 1000000)
    const seenSecondsAgo = (Date.now() - lastSeen) / 1000

    if (seenSecondsAgo < THRESHOLD_IN_SECONDS) {
      return send(response, 200,
        {
          message: 'Your gateway is doing splendidly',
          seen_seconds_ago: seenSecondsAgo
        }
      )
    }

    if (result.code === 5) {
      return send(response, 404, { error_code: 404, message: 'Your gateway does not exist' })
    }

    return send(response, 500,
      {
        error_code: 500,
        message: 'HELP! Your gateway is gone!',
        seen_seconds_ago: seenSecondsAgo
      }
    )
  } catch (e) {
    return send(response, 500, { error_code: 500, message: e.message })
  }
}
