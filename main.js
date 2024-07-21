// Getting references to UI elements
let connectButton = document.getElementById('connect');
let disconnectButton = document.getElementById('disconnect');
let terminalContainer = document.getElementById('terminal');
let distanceDisplay = document.getElementById('distance');

// State to track keys
let keyState = {};

// Connect to device on Connect button click
connectButton.addEventListener('click', function() {
  connect();
});

// Disconnect from device on Disconnect button click
disconnectButton.addEventListener('click', function() {
  disconnect();
});

// Handle keydown and keyup events
document.addEventListener('keydown', function(event) {
  if (['w', 'a', 's', 'd'].includes(event.key) && !keyState[event.key]) {
    keyState[event.key] = true;
    send(`${event.key} pressed`);
  }
});

document.addEventListener('keyup', function(event) {
  if (['w', 'a', 's', 'd'].includes(event.key)) {
    keyState[event.key] = false;
    send(`${event.key} released`);
  }
});

// Device cache object
let deviceCache = null;

// Characteristic cache object
let characteristicCache = null;

// Buffer for incoming data
let readBuffer = '';

// Start selecting Bluetooth device and connect to it
function connect() {
  return (deviceCache ? Promise.resolve(deviceCache) :
      requestBluetoothDevice()).
      then(device => connectDeviceAndCacheCharacteristic(device)).
      then(characteristic => startNotifications(characteristic)).
      catch(error => log(error));
}

// Request Bluetooth device selection
function requestBluetoothDevice() {
  log('Requesting bluetooth device...');

  return navigator.bluetooth.requestDevice({
    filters: [{services: [0xFFE0]}],
  }).
      then(device => {
        log('"' + device.name + '" bluetooth device selected');
        deviceCache = device;
        deviceCache.addEventListener('gattserverdisconnected',
            handleDisconnection);

        return deviceCache;
      });
}

// Handle disconnection
function handleDisconnection(event) {
  let device = event.target;

  log('"' + device.name +
      '" bluetooth device disconnected, trying to reconnect...');

  connectDeviceAndCacheCharacteristic(device).
      then(characteristic => startNotifications(characteristic)).
      catch(error => log(error));
}

// Connect to device, get service and characteristic
function connectDeviceAndCacheCharacteristic(device) {
  if (device.gatt.connected && characteristicCache) {
    return Promise.resolve(characteristicCache);
  }

  log('Connecting to GATT server...');

  return device.gatt.connect().
      then(server => {
        log('GATT server connected, getting service...');

        return server.getPrimaryService(0xFFE0);
      }).
      then(service => {
        log('Service found, getting characteristic...');

        return service.getCharacteristic(0xFFE1);
      }).
      then(characteristic => {
        log('Characteristic found');
        characteristicCache = characteristic;

        return characteristicCache;
      });
}

// Enable notifications for characteristic changes
function startNotifications(characteristic) {
  log('Starting notifications...');

  return characteristic.startNotifications().
      then(() => {
        log('Notifications started');
        characteristic.addEventListener('characteristicvaluechanged',
            handleCharacteristicValueChanged);
      });
}

// Handle characteristic value changes
function handleCharacteristicValueChanged(event) {
  let value = new TextDecoder().decode(event.target.value);

  for (let c of value) {
    if (c === '\n') {
      let data = readBuffer.trim();
      readBuffer = '';

      if (data) {
        receive(data);
      }
    }
    else {
      readBuffer += c;
    }
  }
}

// Process received data
function receive(data) {
  log(data, 'in');

  // Assuming the data received is the ultrasonic distance or GAME OVER notification
  if (data === "GAME OVER") {
    alert(data);
  } else {
    distanceDisplay.textContent = data;
  }
}

// Log to terminal
function log(data, type = '') {
  let logEntry = document.createElement('div');
  logEntry.className = type;
  logEntry.textContent = data;
  terminalContainer.appendChild(logEntry);
  terminalContainer.scrollTop = terminalContainer.scrollHeight; // Scroll to the latest entry
}

// Disconnect from device
function disconnect() {
  if (deviceCache) {
    log('Disconnecting from "' + deviceCache.name + '" bluetooth device...');
    deviceCache.removeEventListener('gattserverdisconnected',
        handleDisconnection);

    if (deviceCache.gatt.connected) {
      deviceCache.gatt.disconnect();
      log('"' + deviceCache.name + '" bluetooth device disconnected');
    }
    else {
      log('"' + deviceCache.name +
          '" bluetooth device is already disconnected');
    }
  }

  if (characteristicCache) {
    characteristicCache.removeEventListener('characteristicvaluechanged',
        handleCharacteristicValueChanged);
    characteristicCache = null;
  }

  deviceCache = null;
}

// Send data to connected device
function send(data) {
  data = String(data);

  if (!data || !characteristicCache) {
    return;
  }

  data += '\n';

  if (data.length > 20) {
    let chunks = data.match(/(.|[\r\n]){1,20}/g);

    writeToCharacteristic(characteristicCache, chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      setTimeout(() => {
        writeToCharacteristic(characteristicCache, chunks[i]);
      }, i * 100);
    }
  }
  else {
    writeToCharacteristic(characteristicCache, data);
  }

  log(data, 'out');
}

// Write value to characteristic
function writeToCharacteristic(characteristic, data) {
  characteristic.writeValue(new TextEncoder().encode(data));
}
