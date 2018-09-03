/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////
//
// Print serial input from a CH34x USB adapter
//
// Copyright (C) 2018 Tom Seddon
//
// This program is free software; you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the Free Software
// Foundation; either version 2 of the License, or (at your option) any later
// version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
// details.
//
// You should have received a copy of the GNU General Public License along with
// this program; if not, write to the Free Software Foundation, Inc., 51
// Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
//
/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

import * as argparse from 'argparse';
import * as usb from 'usb';

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

let gVerbose = false;

function v(x: string) {
    if (gVerbose) {
        process.stderr.write(x);
    }
}

function vn(x: string) {
    if (gVerbose) {
        process.stderr.write(x);
        process.stderr.write('\n');
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

interface ICommandLineOptions {
    verbose: boolean;
    baud: number;
    device: number[];
    hex: boolean;
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

// VID, PID
const deviceTypes: { vid: number, pid: number }[] = [
    // got these values from https://github.com/torvalds/linux/blob/71f3a82fab1b631ae9cb1feb677f498d4ca5007d/drivers/usb/serial/ch341.c#L82
    { vid: 0x4348, pid: 0x5523 },
    { vid: 0x1a86, pid: 0x5523 },
    { vid: 0x1a86, pid: 0x7523 },//this is the one I've tried it with
];

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function findUSBDevice(options: ICommandLineOptions): usb.Device {
    if (options.device.length !== 0) {
        const device = usb.findByIds(options.device[0], options.device[1]);
        if (device === undefined) {
            throw new Error('failed to find specified USB device');
        }
        return device;
    } else {
        for (const deviceType of deviceTypes) {
            v('Trying VID=0x' + deviceType.vid.toString(16) + ' PID=0x' + deviceType.pid.toString(16) + ': ');
            const device = usb.findByIds(deviceType.vid, deviceType.pid);
            if (device !== undefined) {
                vn('success');
                return device;
            }

            vn('no');
        }

        throw new Error('failed to find any known USB device');
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

async function deviceControlTransfer(device: usb.Device, bmRequestType: number, bRequest: number, wValue: number, wIndex: number, dataOrLength: number | Buffer | undefined): Promise<Buffer | undefined> {
    return await new Promise<Buffer | undefined>((resolve, reject) => {
        if (dataOrLength === undefined) {
            dataOrLength = Buffer.alloc(0);
        }
        device.controlTransfer(bmRequestType, bRequest, wValue, wIndex, dataOrLength, (error, buffer) => {
            if (error !== undefined) {
                reject(error);
            } else {
                resolve(buffer);
            }
        });
    });
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function flushHex(offset: number, buffer: number[], numColumns: number, suffix: string) {
    let row = '';

    row += offset.toString(16).padStart(8, '0') + ': ';

    for (let i = 0; i < numColumns; ++i) {
        row += ' ';

        if (i < buffer.length) {
            row += buffer[i].toString(16).padStart(2, '0');
        } else {
            row += '  ';
        }
    }

    row += '  ';

    for (let i = 0; i < numColumns; ++i) {
        if (i < buffer.length) {
            if (buffer[i] >= 32 && buffer[i] < 127) {
                row += String.fromCharCode(buffer[i]);
            } else {
                row += '.';
            }
        } else {
            row += ' ';
        }
    }

    row += suffix;

    process.stdout.write(row);
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

const baudControls: { [index: number]: { a: number, b: number } | undefined } = {
    [2400]: { a: 0xd901, b: 0x0038 },
    [4800]: { a: 0x6402, b: 0x001f },
    [9600]: { a: 0xb202, b: 0x0013 },
    [19200]: { a: 0xd902, b: 0x000d },
    [38400]: { a: 0x6403, b: 0x000a },
    [115200]: { a: 0xcc03, b: 0x0008 },
};

async function main(options: ICommandLineOptions) {
    gVerbose = options.verbose;

    const baudControl = baudControls[options.baud];
    if (baudControl === undefined) {
        throw new Error('unsupported baud rate: ' + options.baud);
    }

    vn('Finding device...');
    const device = findUSBDevice(options);

    vn('Opening device...');
    device.__open();
    device.open();

    vn('Resetting device...');
    await new Promise((resolve, reject) => device.reset((error) => error !== undefined ? reject(error) : resolve()));

    vn('Claiming interface 0...');
    const interf = device.interface(0);
    interf.claim();

    let endpoint: usb.InEndpoint;
    {
        const endpoints = interf.endpoints.filter((endpoint) => endpoint.descriptor.bEndpointAddress === (2 | usb.LIBUSB_ENDPOINT_IN));
        if (endpoints.length !== 1) {
            throw new Error('failed to find expected single input endpoint 2');
        }

        endpoint = endpoints[0] as usb.InEndpoint;
        vn('Max packet size: ' + endpoint.descriptor.wMaxPacketSize);
    }

    vn('Initialising device...');
    const bmRequestType = usb.LIBUSB_REQUEST_TYPE_VENDOR | usb.LIBUSB_ENDPOINT_OUT;

    // https://gist.github.com/z4yx/8d9ecad151dad351fbbb#file-ch340-c-L59
    await deviceControlTransfer(device, bmRequestType, 0xa1, 0, 0, undefined);
    await deviceControlTransfer(device, bmRequestType, 0x9a, 0x2518, 0x0050, undefined);
    await deviceControlTransfer(device, bmRequestType, 0xa1, 0x501f, 0xd90a, undefined);

    // https://gist.github.com/z4yx/8d9ecad151dad351fbbb#file-ch340-c-L34
    await deviceControlTransfer(device, bmRequestType, 0x9a, 0x1312, baudControl.a, undefined);
    await deviceControlTransfer(device, bmRequestType, 0x9a, 0x0f2c, baudControl.b, undefined);

    let hexBuffer: number[] = [];
    let hexOffset = 0;
    let numHexColumns = 16;

    for (; ;) {
        let buffer = await new Promise<Buffer>((resolve, reject) => {
            endpoint.transfer(endpoint.descriptor.wMaxPacketSize, (error, data) => error !== undefined ? reject(error) : resolve(data));
        });

        if (options.hex) {
            for (const byte of buffer) {
                hexBuffer.push(byte);

                if (hexBuffer.length === numHexColumns) {
                    flushHex(hexOffset, hexBuffer, numHexColumns, '\n');
                    hexBuffer = [];
                    hexOffset += numHexColumns;
                }
            }

            if (hexBuffer.length > 0) {
                flushHex(hexOffset, hexBuffer, numHexColumns, '\r');
            }
        } else {
            process.stdout.write(buffer.toString());
        }
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

// crap name for it, but argparse pops the actual function name in the error
// string, so it would be nice to have something vaguely meaningful.
//
// https://github.com/nodeca/argparse/pull/45
function usbVIDOrPID(s: string): number {
    const x = parseInt(s, undefined);
    if (Number.isNaN(x)) {
        throw new Error('invalid number provided: "' + s + '"');
    }

    return x;
}

const parser = new argparse.ArgumentParser({
    addHelp: true,
    description: 'CH341x cat utility',
});

parser.addArgument(['-v', '--verbose'], { action: 'storeTrue', defaultValue: false, help: 'be more verbose' });
parser.addArgument(['-b', '--baud'], { defaultValue: 115200, help: 'set baud rate (default: %(defaultValue)s)' });
parser.addArgument(['--device'], { nargs: 2, metavar: 'ID', type: usbVIDOrPID, defaultValue: [], help: 'set USB device VID/PID.' });
parser.addArgument(['--hex'], { action: 'storeTrue', defaultValue: false, help: 'show data as a hex dump' });

main(parser.parseArgs()).then(() => {
    // done...
}).catch((error) => {
    process.stderr.write('Stack trace:\n');
    process.stderr.write(error.stack + '\n');
    process.stderr.write('FATAL: ' + error + '\n');
    process.exit(1);
});
