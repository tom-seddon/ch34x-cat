# ch34x-cat

Minimal cat-type utility for the WinChipHead CH34x USB serial adapter on OS X.
Sets a baud rate, then prints incoming data until you press Ctrl+C. There are
more sophisticated tools available, but this one has a big advantage: it
controls the device directly, so there's no need to have the amazingly flaky OEM
device driver installed.

(This tool is minimal. You set the baud rate, and that's it. There's no flow
control, it assumes 1 stop bit, and incoming data is printed as-is, with newline
conversion and control codes handled entirely by the terminal.)

# Install

Only tested on OS X. (It sounds like the CH34x drivers on other systems are
fine, so would you even want this on other OSs anyway?)

You'll need node.js and npm.

Clone GitHub repo and do `npm install`.

If you've got the CH34x driver installed, I believe you'll have to uninstall it.
Instructions:
https://github.com/adrianmihalko/ch340g-ch34g-ch34x-mac-os-x-driver#installation

# Run

`npm start --` from in the working copy. The tool will try to find a supported
USB device automatically, set it to 115200 baud, and start printing whatever
comes in.

There are command line options to set the baud rate and manually specify the USB
device to use. Do `npm start -- -h` to get a list. 

# Additional credits

The magic numbers and control transfer details come from
https://gist.github.com/z4yx/8d9ecad151dad351fbbb.
