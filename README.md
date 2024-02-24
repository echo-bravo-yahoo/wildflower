## Basic usage:
### First time users

1. Install wildflower. (It requires `sudo` access, but just to install to usr/bin/local and give it exec permissions. Go read it. It's three lines.)
    ```sh
    curl -o- https://raw.githubusercontent.com/MynockSpit/wildflower/master/install.sh | sh
    ```
2. Install Deno (or let wildflower install Deno for you.)
3. Create a new directory where you'll store your dotfiles (e.g. `valley`), and run `wildflower till`. This will create a sample `meadows.js` (e.g. `valley/meadows.js`) file that you can add files to.
3. Modify the created `meadows.js` with the paths of config files to save.
4. Run `wildflower gather` to collect all the files you've specified in `meadows.js`.
5. Store the contents of `./valley` any way you like.

### Returning users 

1. Install wildflower. (It requires `sudo` access, but just to install to usr/bin/local and give it exec permissions. Go read it. It's three lines.)
    ```sh
    curl -o- https://raw.githubusercontent.com/MynockSpit/wildflower/master/install.sh | sh
    ```
2. Install Deno (or let wildflower install Deno for you.)
2. Pull in your existing meadows.
3. Run `wildflower sow` distribute your config files.

## Known bugs:
- Gather deletes a directory synchronously when an async workflow would be ideal
- No way to specify files to ignore
