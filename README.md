## Basic usage:
### First time users

1. Install wildflower. (It requires `sudo` access, but just to install to usr/bin/local and give it exec permissions. Go read it. It's three lines.)
    ```sh
    curl -o- https://raw.githubusercontent.com/MynockSpit/wildflower/master/install.sh | sh
    ```
2. Install Deno (or let wildflower install Deno for you.)
3. Create a new directory where you'll store your dotfiles (e.g. `valley`).
4. Run `wildflower till`. This will create a sample `meadows.js` (e.g. `valley/meadows.js`) to use as a starting-point.
5. Add files you want to gather to the `meadows.js`.
6. Run `wildflower gather` to collect all the files you've specified in `meadows.js`.
7. Store the contents of `./valley` any way you like.

### Returning users 

1. Install wildflower. (It requires `sudo` access, but just to install to usr/bin/local and give it exec permissions. Go read it. It's three lines.)
    ```sh
    curl -o- https://raw.githubusercontent.com/MynockSpit/wildflower/master/install.sh | sh
    ```
2. Install Deno (or let wildflower install Deno for you.)
2. Pull in your existing meadows.
3. Run `wildflower sow` distribute your config files.

## Todo:
- Create an "update" or "install" command or something, so that we can get new versions of wildflower (b/c deno caching is a thing)
- Possibly use the update or install instead of the initial installer?
- Add ability for wildflower to run commands
- Add some kind of ordering mechanism (wait for 'x' before doing 'y'.) 

## Known bugs:
- Gather deletes a directory synchronously when an async workflow would be ideal
- No way to specify files to ignore
