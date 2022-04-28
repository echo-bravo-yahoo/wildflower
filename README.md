## Basic usage:
### First time users

1. Clone this repo.
2. Run `npm run till`
3. Modify the created `./valley/meadows.js` with the paths of config files to save.
4. Run `npm run gather` to collect all the files you want to save.
5. Store the contents of `./valley` any way you like (recommendation is git).

### Returning users 

1. Clone this repo.
2. Copy your existing `./valley` into this repo.
3. Run `npm run sow` to take the files in your `valley` folder and distribute them

## Known bugs:
- Gather deletes a directory synchronously when an async workflow would be ideal
- No way to specify files to ignore
