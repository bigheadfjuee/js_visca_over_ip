const dgram = require('dgram')
const { Buffer } = require('buffer')
const udp = dgram.createSocket('udp4')
const debug = require('debug')('visca_over_ip')

// Aver HDC-716 test ok

// Tony 本機 bind 也是用這個 port 收 camera 的 reply
const HDC716_UDP_PORT = 52381 // AVER:52381, Sony:52380
const HDC716_RECV_SCAN_PORTT = 53079 // recv scan
const HDC716_SCAN_PORT = 8000 // send scan (UDP broadcast)

// 用來判斷每次 發/收 的 sequence number
let seqNumber = 0

// vista over ip 的攝影機位置通常都是1 ，在 RS-232/485 才會分別用 1~8 控多台
const camAddr = '1'
const typeCmd = '0100'
const typeInq = '0110'
const typeReply = '0111'

// 8x 中的 x 要改成 camAddr
const viscaCmd = {

  // camera 功能關閉，Live 沒畫面，但網路 ping 和 visca_over_ip 還會運作
  camPowerOn: '8x01040002FF',
  camPowerOff: '8x01040003FF',

  camZoomStop: '8x01040700FF',
  // p: 0 ~ 7 (speed low to high)
  camZoomTele: '8x0104072pFF',
  camZoomWide: '8x0104073pFF',

  // pp : preset number 0x00 ~ 0xff
  camPresetReset: '8x01043F00ppFF',
  camPresetSet: '8x01043F01ppFF',
  camPresetRecall: '8x01043F02ppFF',

  // Aver
  // VV: Pan speed 0x01 ~ 0x18 (low to high)
  // WW: Tilt spped 0x01 ~ 0x18
  // Tony : 依不同的廠型號，會有不同的範圍
  // 憲哥 : Aver 的文件 PT driver 結尾沒有 FF 但其它家的文件有
  ptUp: '8x010601VVWW0301FF',
  ptDown: '8x010601VVWW0302FF',
  ptLeft: '8x010601VVWW0103FF',
  ptRight: '8x010601VVWW0203FF',
  ptStop: '8x010601VVWW0303FF',

  ptHome: '8x010604FF',
  ptReset: '8x010605FF',

}

const viscaInq = {
  camPowerIng: '8x090400FF',
  camZoomPosInq: '8x090447FF'
}

let self = null
const ViscaOverIp = function () {

  this.camIp = ''
  this.camPort = HDC716_UDP_PORT
  this.isBindUdpPort = false

  this.devList = []
  self = this
}

ViscaOverIp.prototype.init = async function (ip) {

  this.camIp = ip !== undefined ? ip : '127.0.0.1'

  udp.on('error', (err) => {
    console.log(`ViscaOverIp udp error:\n${err.stack}`);
    // udp.close();
  });

  udp.on('message', (msg, rinfo) => {
    debug(`udp got from ${rinfo.address}:${rinfo.port}`);
    debug(msg.toString('hex'));
    parseInq(msg.toString('hex'))
  });

  udp.on('listening', () => {
    const address = udp.address();
    debug(`udp listening ${address.address}:${address.port}`);
  });

  if (this.isBindUdpPort)
    udp.bind(this.camPort);

}

function parseInq(msg) {
  // 0111 0004 00000000 905002ff
  const type = msg.slice(0, 4)
  const bytes = msg.slice(4, 8)
  const sn = msg.slice(8, 16)
  const payload = msg.slice(16)

  // 2 個 hex 為一個 byte
  const check = payload.length === parseInt(bytes) * 2 ? true : false

  // console.log({ type, len: bytes, sn, payload, check });
  // TODO: 解析內容取得攝影機參數 => 還未實作
}

ViscaOverIp.prototype.send = function (type, cmd) {
  // 也就是 cmd 有幾個 byte ，二個 hex表示字元為一個 byte
  const payloadLength = (cmd.length / 2).toString(16)
  const len = padLeft(payloadLength, 4)

  function padLeft(str, lenght) {
    if (str.length >= lenght)
      return str;
    else
      return padLeft('0' + str, lenght);
  }

  seqNumber += seqNumber

  const sn = padLeft(seqNumber.toString(16), 8)
  const payload = cmd.replace('x', camAddr)
  const msg = `${type}${len}${sn}${payload}`

  this.sendUdp(msg)
}

ViscaOverIp.prototype.sendUdp = function (msg) {

  const buf = Buffer.from(msg, 'hex')
  debug('sendUdp');
  debug(buf);

  udp.send(buf, this.camPort, this.camIp, (err) => {
    if (err)
      console.log('ViscaOverIp udp.send - err: ', err)
  })
}

ViscaOverIp.prototype.scanDevice = function () {
  const viscaScan = dgram.createSocket('udp4')

  viscaScan.bind(HDC716_RECV_SCAN_PORTT, () => {

    viscaScan.setBroadcast(true);
    let buf = Buffer.alloc(240, 0x41, 'hex');
    buf.write('55454e465a476c304167', 0, 'hex');
    buf.writeUInt8(0x49, 34);
    buf.writeUInt8(0x43, 43);
    viscaScan.send(buf, 0, buf.length, HDC716_SCAN_PORT, '255.255.255.255')
  })

  viscaScan.on('message', (msg, remote) => {

    let dev = {
      name: msg.slice(73, 80).toString() || '',
      deviceId: msg.slice(14, 20).toString('hex') || '',
      ip: remote.address
    }
    console.log(dev)
    self.devList.push(dev)
  })
}

ViscaOverIp.prototype.getPower = function () {
  this.send(typeInq, viscaInq.camPowerIng)
}

ViscaOverIp.prototype.setPower = function (op) {
  if (op === 'on')
    this.send(typeCmd, viscaCmd.camPowerOn)
  else if (op === 'off')
    this.send(typeCmd, viscaCmd.camPowerOff)
}

ViscaOverIp.prototype.camZoom = function (type = 'stop', speed = 0) {
  let p = speed
  if (p < 0)
    p = 0
  else (p > 7)
  p = 7

  let cmd = ''
  switch (type) {
    case 'stop':
      cmd = viscaCmd.camZoomStop
      break
    case 'tele':
      cmd = viscaCmd.camZoomTele
      break
    case 'widt':
      cmd = viscaCmd.camZoomWide
      break
    default:
      throw 'unknownd type'
  }

  cmd = cmd.replace('p', p.toString())
  this.send(typeCmd, cmd)
}

ViscaOverIp.prototype.ptDrive = function (type = 'stop', speed = '01') {
  const s = parseInt(speed, 16)
  //0x01 ~ 0x18
  if (s > 24)
    throw ('pt speed is out of range (1~24)')

  let cmd = ''
  switch (type) {
    case 'stop':
      cmd = viscaCmd.ptStop
      break
    case 'up':
      cmd = viscaCmd.ptUp
      break
    case 'down':
      cmd = viscaCmd.ptDown
      break
    case 'left':
      cmd = viscaCmd.ptLeft
      break
    case 'right':
      cmd = viscaCmd.ptRight
      break
    case 'home':
      cmd = viscaCmd.ptHome
      break

    default:
      throw 'unknownd type'
  }

  cmd = cmd.replace('VV', speed)
  cmd = cmd.replace('WW', speed)
  this.send(typeCmd, cmd)
}


ViscaOverIp.prototype.preset = function (type = '', pNumber = 0) {
  if (pNumber < 0 || pNumber > 255)
    throw 'preset number is out of range.'

  let cmd = ''
  switch (type) {
    case 'reset':
      cmd = viscaCmd.camPresetReset
      break
    case 'set':
      cmd = viscaCmd.camPresetSet
      break
    case 'recall':
      cmd = viscaCmd.camPresetRecall
      break
    default:
      throw 'unknownd type'
  }

  cmd = cmd.replace('pp', pNumber.toString('16'))
  this.send(typeCmd, cmd)
}


module.exports = new ViscaOverIp()