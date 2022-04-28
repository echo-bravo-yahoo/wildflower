const meadows = [
    {
        path: '~/.vimrc',
    },
    {
        path: '~/.taskrc',
    },
    {
        path: '~/.zshrc',
    },
    {
        path: '~/.zshenv',
    },
    {
        path: '~/.bashrc',
    },
    {
        path: '~/iterm'
    },
    {
        path: '~/.vit'
    },
    {
        path: '~/.secrets'
    },
    {
        path: '~/.gitconfig'
    },
    {
        path: '~/.gitignore'
    },
    {
        path: '~/workspace/applescript'
    },
    {
        // used by ag / fzf
        // does not exist on my mac!
        path: '~/.ignore'
    },
    {
        // my aliases, config, etc live in ~/.config/$NAME
        // also used by nvim
        path: '~/.config',
        filter: [
          "**/*",
          "!**/coc/**",
          "!**/configstore/**",
          "!**/thefuck/**",
          "!**/iterm2/**",
          "!**/yarn/**",
          "!**/wslu/**",
          "!**/syncthing/**"
        ]
    },
    {
        path: '~/.p10k.zsh'
    },
    {
        path: '~/.oci'
    },
    // conemu config (windows)
    // personal aws config (windows)
    // global gitignore
]

module.exports = meadows
