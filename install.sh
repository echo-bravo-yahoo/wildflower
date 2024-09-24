#!/bin/sh

install_wildflower() {
  npm ls -g wildflower && {
    echo "wildflower already installed. Nothing to do. Exiting…"
  } || {
    echo "Installing wildflower…"
    npm i -g github:echo-bravo-yahoo/wildflower || {
      echo "Failed to install wildflower. Exiting!"
      exit 1
    }
  }
}

NVM_VERSION=""
NODE_VERSION=""

NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh" # This loads nvm
  NVM_VERSION=$(nvm --version)
fi

NODE_VERSION=$(node --version)

if [ "$NVM_VERSION" = "" ] && [ "$NODE_VERSION" != "" ]; then 
	echo "Detected node without nvm. Installing wildflower globally. Good luck!"

  install_wildflower
else
	if [ "$NVM_VERSION" = "" ]; then
		echo "Installing nvm…"

    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    . "$NVM_DIR/nvm.sh"
  else
		echo "nvm already installed!"
	fi

	if [ "$NODE_VERSION" = "" ]; then
		echo "Installing node…"

    nvm install 20
  else
		echo "node already installed!"
	fi

  install_wildflower

  # install a bin in `/usr/local/bin` that points to the version of wildflower we just installed
  mkdir -p /usr/local/bin
  echo '#!/bin/sh
NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
. "$NVM_DIR/nvm.sh"

nvm exec '"$(node --version)"' wildflower "$@"' | sudo tee /usr/local/bin/wildflower > /dev/null
  sudo chmod +x /usr/local/bin/wildflower
fi