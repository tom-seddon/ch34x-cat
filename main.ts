import * as argparse from 'argparse';

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

// These are the defaults for the one I've got
const DEFAULT_USB_VID = 0x7523;
const DEFAULT_USB_PID = 0x1a86;

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

interface ICommandLineOptions {
    verbose: boolean;
    baud: number;
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

async function main(options: ICommandLineOptions) {
    process.stderr.write('hello\n');
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
parser.addArgument(['--device'], { nargs: 2, metavar: 'ID', type: usbVIDOrPID, defaultValue: [DEFAULT_USB_VID, DEFAULT_USB_PID], help: 'set USB device VID/PID. Default: 0x' + DEFAULT_USB_VID.toString(16) + ' 0x' + DEFAULT_USB_PID.toString(16) });

main(parser.parseArgs()).then(() => {
    // done...
}).catch((error) => {
    process.stderr.write('Stack trace:\n');
    process.stderr.write(error.stack + '\n');
    process.stderr.write('FATAL: ' + error + '\n');
    process.exit(1);
});