console.log(`%c %s`, "font-family:monospace", `
 __  __     __  __     ______       __        _____      __
/\\ \\/ /    /\\ \\_\\ \\   /\\  __ \\     /\\ \\      /\\  __ \\   /\\ \\
\\ \\  _"-.  \\ \\  __ \\  \\ \\ \\/\\ \\   _\\_\\ \\     \\ \\  __ \\  \\ \\ \\
 \\ \\_\\ \\_\\  \\ \\_\\ \\_\\  \\ \\_____\\ /\\_____\\     \\ \\_\\ \\_\\  \\ \\_\\
  \\/_/\\/_/   \\/_/\\/_/   \\/_____/ \\/_____/      \\/_/\\/_/   \\/_/

Greetings traveller,

I am ✨KIT✨, your open-source, personal AI copilot.

See my source code at https://github.com/KIT-ai/KIT
Read my operating manual at https://docs.KIT.dev
`);


window.appInfoAPI.getInfo((_, info) => {
    let KITVersionElement = document.getElementById("about-page-version");
    if (KITVersionElement) {
        KITVersionElement.innerHTML = `<code>${info.version}</code>`;
    }
    let KITTitleElement = document.getElementById("about-page-title");
    if (KITTitleElement) {
        KITTitleElement.innerHTML = '<b>KIT for ' + (info.platform === 'win32' ? 'Windows' : info.platform === 'darwin' ? 'macOS' : 'Linux') + '</b>';
    }
});

function toggleNavMenu() {
    let menu = document.getElementById("KIT-nav-menu");
    menu.classList.toggle("show");
}

// Close the dropdown menu if the user clicks outside of it
document.addEventListener('click', function (event) {
    let menu = document.getElementById("KIT-nav-menu");
    let menuContainer = document.getElementById("KIT-nav-menu-container");
    let isClickOnMenu = menuContainer?.contains(event.target) || menuContainer === event.target;
    if (menu && isClickOnMenu === false && menu.classList.contains("show")) {
        menu.classList.remove("show");
    }
});

async function populateHeaderPane() {
    let userInfo = null;
    try {
        userInfo = await window.userInfoAPI.getUserInfo();
    } catch (error) {
        console.log("User not logged in");
    }

    let username = userInfo?.username ?? "?";
    let user_photo = userInfo?.photo;
    let is_active = userInfo?.is_active;
    let has_documents = userInfo?.has_documents;

    // Populate the header element with the navigation pane
    return `
        <a class="KIT-logo" href="/">
            <img class="KIT-logo" src="./assets/icons/KIT_logo.png" alt="KIT"></img>
        </a>
        <nav class="KIT-nav">
        ${userInfo && userInfo.email
            ? `<div class="KIT-status-box">
              <span class="KIT-status-connected"></span>
               <span class="KIT-status-text">Connected to server</span>
               </div>`
            : `<div class="KIT-status-box">
              <span class="KIT-status-not-connected"></span>
               <span class="KIT-status-text">Not connected to server</span>
               </div>`
        }
            ${username ? `
                <div id="KIT-nav-menu-container" class="KIT-nav dropdown">
                    ${user_photo && user_photo != "None" ? `
                        <img id="profile-picture" class="${is_active ? 'circle subscribed' : 'circle'}" src="${user_photo}" alt="${username[0].toUpperCase()}" referrerpolicy="no-referrer">
                    ` : `
                        <div id="profile-picture" class="${is_active ? 'circle user-initial subscribed' : 'circle user-initial'}" alt="${username[0].toUpperCase()}">${username[0].toUpperCase()}</div>
                    `}
                    <div id="KIT-nav-menu" class="KIT-nav-dropdown-content">
                        <div class="KIT-nav-username"> ${username} </div>
                        <a onclick="window.navigateAPI.navigateToWebHome()" class="KIT-nav-link">
                        <img class="KIT-nav-icon" src="./assets/icons/open-link.svg" alt="Open Host Url"></img>
                        Open App
                        </a>
                    </div>
                </div>
            ` : ''}
        </nav>
    `;
}
