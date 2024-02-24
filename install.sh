#!/bin/sh

# There's gotta be a better way that doesn't require sudo, but this is my best attempt to start.

cd /usr/local/bin/

sudo curl --fail --compressed -qsSo wildflower https://raw.githubusercontent.com/MynockSpit/wildflower/master/wildflower

sudo chmod +x wildflower