class wmMegaMenu {
  static pluginTitle = "wmMegaMenu";
  static defaultSettings = {
    layout: "inset", // header-adapt or folder
    openAnimation: "fade", // or fade, slide, swing
    openAnimationDelay: 300,
    closeAnimationDelay: 300, // New setting
    activeAnimation: "fade",
    activeAnimationDelay: 300,
    mobileBreakpoint: 767,
    triggerIconDisplay: true,
    triggerIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>`,
    hooks: {
      beforeInit: [],
      afterInit: [
        function () {
          wm$?.initializeAllPlugins();
          //
        },
      ],
      beforeOpenMenu: [],
      afterOpenMenu: [],
      beforeCloseMenu: [],
      afterCloseMenu: [],
    },
  };
  static get userSettings() {
    return window[wmMegaMenu.pluginTitle + "Settings"] || {};
  }
  constructor(els) {
    if (els[0].dataset.loadingState) {
      return;
    } else {
      els.forEach(el => (el.dataset.loadingState = "loading"));
    }
    this.els = els;
    this.settings = wm$.deepMerge(
      {},
      wmMegaMenu.defaultSettings,
      wmMegaMenu.userSettings
    );
    this.menus = [];
    this.isMenuOpen = false;
    this.isMobileMenuOpen = false;

    this.headerBottom = 0;
    this.header = document.querySelector("#header");
    this.mobileHeader = this.header.querySelector(".header-menu");
    this.headerContext = JSON.parse(this.header.dataset.currentStyles);
    this.mobileMenuOverlayTheme = this.headerContext.menuOverlayTheme;

    this.siteWrapper = document.querySelector("#siteWrapper");
    this.page = document.querySelector("#page");
    this.mobileFoldersList = this.header.querySelector(".header-menu-nav-list");

    this.defaultHeaderColorTheme = this.header.dataset.sectionTheme;

    this.init();
  }
  async init() {
    this.runHooks("beforeInit");

    await this.buildStructure();
    this.buildDesktopHTML();
    this.buildMobileHTML();
    this.bindEvents();
    this.isMobile =
      window.innerWidth <= this.settings.mobileBreakpoint ? true : false;
    this.placeMegaMenusByScreenSize();
    this.headerCurrentStyles = JSON.parse(this.header.dataset.currentStyles);
    if (window.Squarespace) {
      await wm$.reloadSquarespaceLifecycle([this.menu, this.header]);
    }

    this.activeMenu = this.menus[0];
    this.menu.dataset.sectionTheme = this.activeMenu.colorTheme;

    this.runHooks("afterInit");
  }
  bindEvents() {
    this.addEditModeObserver();
    this.addOpenTriggers();
    this.addCloseTriggers();
    this.addMobileOpenTriggers();
    this.addMobileBackButtonClick();
    this.addEditModeObserver();
    this.addResizeEventListener();
    this.addScrollEventListener();
    this.addBurgerClickEventListener();
    this.addClickEventListener();
    this.addClickToCloseEventListener();
  }
  updateHeaderBottom() {
    const headerRect = this.header.getBoundingClientRect();
    this.headerBottom = `${headerRect.bottom}px`;
    this.menu.style.setProperty("--header-bottom", this.headerBottom);
  }
  async buildStructure() {
    const promises = Array.from(this.els).map(async el => {
      const url = new URL(el.href);
      const urlSlug = el.getAttribute("href");
      const desktopTriggers = document.querySelectorAll(
        `#header .header-inner [href="${urlSlug}"]`
      );
      const referenceUrl = urlSlug.split("=")[1] || "";
      const sourceUrl = url.pathname;
      if (!desktopTriggers.length || !referenceUrl) return null;

      const triggerText = desktopTriggers[0].innerText;
      const mobileTriggerParent = document.querySelector(
        `#header .header-menu [href="${urlSlug}"]`
      ).parentElement;

      try {
        const contentFrag = await wm$?.getFragment(referenceUrl);
        const colorTheme =
          contentFrag.querySelector(".page-section").dataset.sectionTheme;
        return {
          triggerText,
          desktopTriggers,
          mobileTriggerParent,
          urlSlug,
          sourceUrl,
          referenceUrl,
          contentFrag,
          colorTheme,
        };
      } catch (error) {
        console.error(`Error fetching content for ${referenceUrl}:`, error);
        return null;
      }
    });

    this.menus = (await Promise.all(promises)).filter(Boolean);
    this.activeMenu = this.menus[0];
  }
  buildDesktopHTML() {
    document.body.classList.add("wm-mega-menu-plugin");
    const container = document.createDocumentFragment();
    this.container = container;

    const megaMenuDiv = document.createElement("div");
    megaMenuDiv.className = "wm-mega-menu";
    megaMenuDiv.dataset.openAnimation = this.settings.openAnimation;
    megaMenuDiv.dataset.layout = this.settings.layout;
    this.menu = megaMenuDiv;
    this.matchZIndex();

    const wrapperDiv = document.createElement("div");
    wrapperDiv.className = "mega-menu-wrapper";
    this.menuWrapper = wrapperDiv;

    const arrow = document.createElement("div");
    arrow.className = "mega-menu-arrow";
    this.arrow = arrow;

    this.menus.forEach(menu => {
      menu.desktopTriggers.forEach(el => {
        if (menu.sourceUrl === '/') {
          el.setAttribute("href", menu.referenceUrl);
          el.setAttribute("rel", 'nofollow');
          el.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
          });
        } else {
          el.setAttribute("href", menu.sourceUrl);
        }
      });

      const itemDiv = document.createElement("div");
      itemDiv.className = "mega-menu-item";
      itemDiv.dataset.referenceUrl = menu.referenceUrl;
      menu.contentFrag.querySelectorAll(".page-section").forEach(section => {
        itemDiv.appendChild(section);
      });
      wrapperDiv.appendChild(itemDiv);
      menu.item = itemDiv;
    });

    megaMenuDiv.appendChild(wrapperDiv);
    megaMenuDiv.appendChild(arrow);
    container.appendChild(megaMenuDiv);

    this.header.appendChild(container);
    this.setActiveSizing();
  }
  buildMobileHTML() {
    this.menus.forEach(menu => {
      const newMobileTrigger = buildMobileTrigger(menu);
      menu.mobileFolder = buildMobileFolder(menu.referenceUrl);
      menu.mobileBackButton = menu.mobileFolder.querySelector(
        'a[data-action="back"]'
      );

      this.mobileFoldersList.append(menu.mobileFolder);
      menu.mobileTriggerParent.innerHTML = "";
      menu.mobileTriggerParent.append(newMobileTrigger);
      menu.mobileTrigger = menu.mobileTriggerParent.querySelector("a");
      menu.mobileContainer = menu.mobileFolder.querySelector(
        ".header-menu-nav-folder-content"
      );
    });

    function buildMobileTrigger(menu) {
      const sourceUrl = menu.sourceUrl;
      const url = menu.referenceUrl;
      const name = menu.triggerText;

      // Create the main anchor element
      const mobileLink = document.createElement("a");
      mobileLink.setAttribute("data-folder-id", url);
      mobileLink.href = sourceUrl;

      // Create the content container
      const contentDiv = document.createElement("div");
      contentDiv.className = "header-menu-nav-item-content";

      // Create and append the visually hidden span
      const hiddenSpan = document.createElement("span");
      hiddenSpan.className = "visually-hidden";
      hiddenSpan.textContent = "Folder:";
      contentDiv.appendChild(hiddenSpan);

      // Create and append the name span
      const nameSpan = document.createElement("span");
      nameSpan.textContent = name;
      contentDiv.appendChild(nameSpan);

      // Create and append the chevron span
      const chevronSpan = document.createElement("span");
      chevronSpan.className = "chevron chevron--right";
      contentDiv.appendChild(chevronSpan);

      // Append the content div to the main anchor
      mobileLink.appendChild(contentDiv);

      return mobileLink;
    }
    function buildMobileFolder(folderPath = "/demo-url") {
      // Create the main container div
      const folder = document.createElement("div");
      folder.setAttribute("data-folder", folderPath);
      folder.className = "header-menu-nav-folder mobile-mega-menu-folder";

      // Create the folder content div
      const folderContent = document.createElement("div");
      folderContent.className = "header-menu-nav-folder-content";

      // Create the controls container
      const controlsContainer = document.createElement("div");
      controlsContainer.className =
        "header-menu-controls container header-menu-nav-item";

      // Create the back button
      const backButton = document.createElement("a");
      backButton.className =
        "header-menu-controls-control header-menu-controls-control--active";
      backButton.setAttribute("data-action", "back");
      backButton.href = "/";
      backButton.tabIndex = -1;

      // Create and append the chevron span
      const chevronSpan = document.createElement("span");
      chevronSpan.className = "chevron chevron--left";
      backButton.appendChild(chevronSpan);

      // Create and append the text span
      const textSpan = document.createElement("span");
      textSpan.textContent = "Back";
      backButton.appendChild(textSpan);

      // Assemble the structure
      controlsContainer.appendChild(backButton);
      folderContent.appendChild(controlsContainer);
      folder.appendChild(folderContent);

      return folder;
    }
  }
  addCloseTriggers() {
    this.menuWrapper.addEventListener("mouseleave", e => {
      if (e.relatedTarget && e.relatedTarget === this.menu) {
        this.closeMenu();
        return;
      }
      if (e.relatedTarget && e.relatedTarget.closest("#header")) {
        return;
      }

      this.closeMenu();
    });

    const closeTriggers = this.header.querySelectorAll(".header-inner a");
    let closeTimeout;

    closeTriggers.forEach(el => {
      el.addEventListener("mouseenter", () => {
        // Clear any existing timeout
        if (closeTimeout) {
          clearTimeout(closeTimeout);
        }

        // If there's an active menu and this element isn't its trigger
        if (this.activeMenu && this.activeMenu.desktopTriggers) {
          closeTimeout = setTimeout(() => {
            const isActiveTrigger = Array.from(
              this.activeMenu.desktopTriggers
            ).some(trigger => trigger === el);
            if (!isActiveTrigger) {
              this.closeMenu();
            }
          }, 150);
        }
      });

      // Clear the timeout if the mouse leaves the element before 150ms
      el.addEventListener("mouseleave", () => {
        if (closeTimeout) {
          clearTimeout(closeTimeout);
        }
      });
    });
  }
  addClickEventListener() {
    this.menu.addEventListener("click", e => {
      this.setActiveSizing();
      window.setTimeout(() => {
        this.setActiveSizing();
      }, 300);
    });
  }
  addClickToCloseEventListener() {
    document.addEventListener("click", e => {
      if (e.target.closest(".mega-menu-wrapper")) return;
      this.closeMenu();
    });
  }
  addMobileOpenTriggers() {
    this.menus.forEach(menu => {
      const trigger = menu.mobileTrigger;
      const handleClick = () => {
        this.activeMenu = menu;
        this.matchColorTheme();
      };
      trigger.addEventListener("click", handleClick);
    });
  }
  addMobileBackButtonClick() {
    this.menus.forEach(menu => {
      const backButton = menu.mobileBackButton;
      const handleClick = () => {
        this.revertColorTheme();
      };
      backButton.addEventListener("click", handleClick);
    });
  }
  addOpenTriggers() {
    this.menus.forEach(menu => {
      const triggers = menu.desktopTriggers;
      triggers.forEach(trigger => {
        let openTimeout;

        trigger.addEventListener("mouseenter", () => {
          openTimeout = setTimeout(() => {
            this.openMenu(menu);
          }, 80);
        });

        trigger.addEventListener("mouseleave", () => {
          clearTimeout(openTimeout);
        });

        trigger.classList.add("mega-menu-link");
        trigger
          .closest(".header-nav-item")
          ?.classList.add("header-nav-item--mega-menu");
        this.settings.triggerIconDisplay
          ? trigger.insertAdjacentHTML("beforeend", this.settings.triggerIcon)
          : null;
      });
    });
  }
  openMenu(menu) {
    this.runHooks("beforeOpenMenu", menu);
    if (this.isMenuOpen && this.activeMenu === menu) return;
    this.activeMenu = menu;
    this.setSizing();
    this.updateHeaderBottom();
    if (this.settings.layout !== "inset") {
      this.matchColorTheme();
    }
    if (!this.isMenuOpen && this.settings.layout === "inset")
      this.setMenuPositioning(true);

    this.setActiveSizing(true);

    // Start the opening animation using Web Animations API
    if (this.isMenuOpen) {
      this.showActiveMenu();
      return;
    }

    const openAnimation = this.menu.animate(this.getOpenAnimationKeyframes(), {
      duration: this.settings.openAnimationDelay,
      easing: "ease-out",
      fill: "forwards",
    });

    this.positionArrow()

    // Add classes for any CSS-based styling
    this.menu.classList.add("open");
    document.body.classList.add("wm-mega-menu--open");

    const arrowAnimation = this.arrow.animate(
      [
        {opacity: 0, transform: 'translateY(15px) rotate(45deg)'},
        {opacity: 1, transform: 'translateY(0px) rotate(45deg)'},
      ],
      {
        duration: 300,
        easing: "ease-out",
        fill: "forwards",
        delay: 150,
      }
    );

    // Wait for the animation to finish before showing the active menu
    openAnimation.onfinish = () => {
      this.isMenuOpen = true;
      this.showActiveMenu();
      this.runHooks("afterOpenMenu", menu);
    };
  }
  showActiveMenu() {
    let before = true;
    this.menu.dataset.sectionTheme = this.activeMenu.colorTheme;
    if (this.settings.layout === "inset") {
      this.setMenuPositioning();
    }
    this.menu.dataset.activeMenu = this.activeMenu.referenceUrl;
    this.setActiveSizing();
    this.menus.forEach(menu => {
      if (this.activeMenu === menu) {
        this.positionArrow();
        before = false;
        menu.desktopTriggers.forEach(trigger =>
          trigger.parentElement.classList.add("mega-menu--active")
        );
        menu.item.classList.add("active");

        const placement = menu.item.dataset.menuArrangement;
        let startPos = "translateY(20px)";
        let endPos = "translateY(0px)";
        if (placement === "before") {
          startPos = "translateX(20px)";
          endPos = "translateX(0px)";
        } else if (placement === "after") {
          startPos = "translateX(-20px)";
          endPos = "translateX(0px)";
        }

        // Animate the active menu item
        const activeItemAnimation = menu.item.animate(
          [
            {opacity: 0, transform: startPos},
            {opacity: 1, transform: endPos},
          ],
          {
            duration: this.settings.activeAnimationDelay,
            easing: "ease-out",
            fill: "forwards",
          }
        );

        activeItemAnimation.onfinish = () => {
          menu.item.dataset.menuArrangement = "active";
          //this.setActiveSizing();
        };
      } else {
        menu.desktopTriggers.forEach(trigger =>
          trigger.parentElement.classList.remove("mega-menu--active")
        );
        menu.item.classList.remove("active");
        menu.item.dataset.menuArrangement = before ? "before" : "after";
      }
    });
    // this.positionArrow()
  }
  closeMenu() {
    this.runHooks("beforeCloseMenu");

    if (!this.isMenuOpen) return;

    // Start the closing animation using Web Animations API
    const closeAnimation = this.menu.animate(
      this.getCloseAnimationKeyframes(),
      {
        duration: this.settings.closeAnimationDelay,
        easing: "ease-in",
        fill: "forwards",
      }
    );

    // Wait for the animation to finish before cleaning up
    closeAnimation.onfinish = () => {
      this.menu.classList.remove("open");
      document.body.classList.remove("wm-mega-menu--open");
      this.isMenuOpen = false;

      if (this.settings.layout !== "inset") {
        this.revertColorTheme();
      }

      this.menus.forEach(menu => {
        menu.desktopTriggers.forEach(trigger =>
          trigger.parentElement.classList.remove("mega-menu--active")
        );
        menu.item.dataset.menuArrangement = "";
        menu.item.classList.remove("active");
      });

      this.runHooks("afterCloseMenu");
    };

    // Immediately start fading out the active menu item
    if (this.activeMenu) {
      this.activeMenu.item.animate(
        [
          {opacity: 1, transform: "translateY(0)"},
          {opacity: 0, transform: "translateY(20px)"},
        ],
        {
          duration: this.settings.closeAnimationDelay * 0.5, // Faster than main close animation
          easing: "ease-in",
          fill: "forwards",
        }
      );
    }
  }
  getOpenAnimationKeyframes() {
    switch (this.settings.openAnimation) {
      case "fade":
        return [
          {opacity: 0, visibility: "hidden"},
          {opacity: 1, visibility: "visible"},
        ];
      case "slide":
        return [
          {
            transform: `translateY(-${this.activeMenu.height}px)`,
            opacity: 0,
            visibility: "hidden",
          },
          {transform: "translateY(0)", opacity: 1, visibility: "visible"},
        ];
      case "swing":
        return [
          {
            transform: "rotateX(-90deg) translateZ(0px)",
            opacity: 0,
            visibility: "hidden",
          },
          {
            transform: "rotateX(0deg) translateZ(0px)",
            opacity: 1,
            visibility: "visible",
          },
        ];
      default:
        return [
          {opacity: 0, visibility: "hidden"},
          {opacity: 1, visibility: "visible"},
        ];
    }
  }
  getCloseAnimationKeyframes() {
    // Reverse the open animation keyframes
    switch (this.settings.openAnimation) {
      case "fade":
        return [
          {opacity: 1, visibility: "visible"},
          {opacity: 0, visibility: "hidden"},
        ];
      case "slide":
        return [
          {transform: "translateY(0)", opacity: 1, visibility: "visible"},
          {
            transform: `translateY(-${this.activeMenu.height}px)`,
            opacity: 0,
            visibility: "hidden",
          },
        ];
      case "swing":
        return [
          {
            transform: "rotateX(0deg) translateZ(0px)",
            opacity: 1,
            visibility: "visible",
          },
          {
            transform: "rotateX(-90deg) translateZ(0px)",
            opacity: 0,
            visibility: "hidden",
          },
        ];
      default:
        return [
          {opacity: 1, visibility: "visible"},
          {opacity: 0, visibility: "hidden"},
        ];
    }
  }
  positionArrow() {
    const arrow = this.arrow;
    const menu = this.menu;
    const menuWrapper = this.menuWrapper;
    const menuItem = this.activeMenu;

    const menuWrapperRect = menuWrapper.getBoundingClientRect();
    const menuTriggerRect = menuItem.desktopTriggers[0].getBoundingClientRect();

    const arrowX =
      menuTriggerRect.left + menuTriggerRect.width / 2 - arrow.offsetWidth / 2;
    const arrowY = menuWrapperRect.top - arrow.offsetHeight / 2;

    arrow.style.left = `${arrowX}px`;
    arrow.style.top = `${arrowY}px`;
  }
  matchZIndex() {
    const headerStyle = window.getComputedStyle(this.header);
    let headerZIndex = headerStyle.getPropertyValue("z-index");
    headerZIndex = parseInt(headerZIndex, 10) || 0;
    const menuZIndex = Math.max(0, headerZIndex - 1);
    this.menu.style.setProperty("--z-index", menuZIndex);
  }
  matchColorTheme() {
    this.menu.dataset.sectionTheme = this.activeMenu.colorTheme;
    if (
      this.settings.layout === "inset" &&
      window.innerWidth > this.settings.mobileBreakpoint
    )
      return;
    this.header.dataset.sectionTheme = this.activeMenu.colorTheme;
    this.mobileHeader.dataset.sectionTheme = this.activeMenu.colorTheme;
  }
  revertColorTheme() {
    this.menu.dataset.sectionTheme = this.defaultHeaderColorTheme;
    if (
      this.settings.layout === "inset" &&
      window.innerWidth > this.settings.mobileBreakpoint
    )
      return;
    if (this.isMobileMenuOpen) {
      window.setTimeout(() => {
        this.header.dataset.sectionTheme = this.mobileMenuOverlayTheme;
        this.mobileHeader.dataset.sectionTheme = this.mobileMenuOverlayTheme;
      }, 100);
    } else {
      window.setTimeout(() => {
        this.header.dataset.sectionTheme = this.defaultHeaderColorTheme;
      }, 10);
    }
  }
  addEditModeObserver() {
    if (window.self === window.top) return;

    let deconstructed = false;
    const self = this;

    function deconstruct() {
      self.menu.remove();
      self.menus = [];
      wm$.reloadSquarespaceLifecycle();
    }

    // Observe changes to the body's class attribute
    const bodyObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === "class") {
          const classList = document.body.classList;
          if (classList.contains("sqs-edit-mode-active")) {
            if (!deconstructed) {
              deconstructed = true;
              deconstruct();
              bodyObserver.disconnect();
            }
          }
        }
      });
    });

    bodyObserver.observe(document.body, {
      attributes: true,
    });
  }
  runHooks(hookName, ...args) {
    const hooks = this.settings.hooks[hookName] || [];
    hooks.forEach(callback => {
      if (typeof callback === "function") {
        callback.apply(this, args);
      }
    });
  }
  setActiveSizing() {
    this.menu.style.setProperty("--active-menu-height", "0px");
    // Calculate the cumulative height of all direct children
    const height = Array.from(this.activeMenu.item.children).reduce(
      (total, child) => {
        return total + child.offsetHeight;
      },
      0
    );

    const left = this.activeMenu.item.offsetLeft;
    this.menuWrapper.scrollLeft = left;
    this.menu.style.setProperty("--active-menu-height", height + "px");
    this.menuWrapper.offsetHeight;

    const maxWidth = this.activeMenu.width;
    this.menuWrapper.style.maxWidth = maxWidth + "px";
  }
  setSizing() {
    this.menus.forEach(menu => {
      const height = Array.from(menu.item.children).reduce((total, child) => {
        return total + child.offsetHeight;
      }, 0);
      menu.height = height;
      menu.width = parseInt(
        window.getComputedStyle(menu.item).getPropertyValue("max-width")
      );
    });
  }
  setMenuPositioning(shouldJump = false) {
    if (shouldJump) {
      this.menuWrapper.style.transition = "none";
    }

    if (
      this.headerCurrentStyles?.layout === "navLeft" ||
      this.headerCurrentStyles?.layout === "brandingCenter"
    ) {
      this.menu.style.justifyContent = "";
      const activeTrigger = this.activeMenu.desktopTriggers[0];
      const triggerRect = activeTrigger.getBoundingClientRect();
      const leftOffset = Math.max(
        0,
        triggerRect.left - window.innerWidth * 0.02 - 68
      );

      this.menuWrapper.style.marginLeft = `${leftOffset}px`;
    }
    if (this.headerCurrentStyles?.layout === "navRight") {
      this.menu.style.justifyContent = "flex-end";
      const activeTrigger = this.activeMenu.desktopTriggers[0];
      const triggerRect = activeTrigger.getBoundingClientRect();
      const rightOffset = Math.max(
        0,
        window.innerWidth - triggerRect.right - window.innerWidth * 0.02 - 68
      );

      this.menuWrapper.style.marginRight = `${rightOffset}px`;
    }
    if (
      this.headerCurrentStyles?.layout === "navCenter" ||
      this.headerCurrentStyles?.layout === "brandingCenterNavCenter"
    ) {
      this.menu.style.justifyContent = "";
      const activeTrigger = this.activeMenu.desktopTriggers[0];
      const triggerRect = activeTrigger.getBoundingClientRect();
      const menuWrapperRect = this.menuWrapper.getBoundingClientRect();

      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      const menuWrapperCenter = this.activeMenu.width / 2;

      const offset =
        triggerCenter - menuWrapperCenter - window.innerWidth * 0.04;

      this.menuWrapper.style.transform = `translateX(${offset}px)`;
    }

    if (shouldJump) {
      this.menuWrapper.offsetHeight;

      setTimeout(() => {
        this.menuWrapper.style.transition = "";
      }, 0);
    }
  }
  addResizeEventListener() {
    const handleResize = () => {
      this.isMobile =
        window.innerWidth <= this.settings.mobileBreakpoint ? true : false;
      if (!this.isMobile) this.closeMenu();
      this.placeMegaMenusByScreenSize();
    };
    window.addEventListener("resize", handleResize);
  }
  placeMegaMenusByScreenSize() {
    if (this.isMobile) {
      this.menus.forEach(menu => {
        menu.mobileFolder.append(menu.item);
      });
    } else {
      this.menus.forEach(menu => {
        this.menuWrapper.append(menu.item);
      });
    }
  }
  addScrollEventListener() {
    let ticking = false;

    window.addEventListener("scroll", () => {
      if (!this.isMenuOpen) return;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (this.header.classList.contains("shrink")) {
            this.closeMenu();
          }
          ticking = false;
        });

        ticking = true;
      }
    });
  }
  addBurgerClickEventListener() {
    const burgers = this.header.querySelectorAll(".header-burger-btn");
    const handleClick = e => {
      if (e.target.closest("button").matches(".burger--active")) {
        this.isMobileMenuOpen = true;
      } else {
        this.isMobileMenuOpen = false;
        this.revertColorTheme();
      }
    };
    burgers.forEach(burger => burger.addEventListener("click", handleClick));
  }
  get activeMenu() {
    return this._activeMenu;
  }
  set activeMenu(menu) {
    this._activeMenu = menu;
  }
  get loadingState() {
    return this._loadingState;
  }
  set loadingState(value) {
    this._loadingState = value;
  }
}

(() => {
  function initMegaMenu() {
    // const els = document.querySelectorAll("[data-mega-menu]");
    const els = document.querySelectorAll(
      ".header-menu-nav a[href*='#wm-mega']"
    );
    if (!els.length) return;
    new wmMegaMenu(els);
  }
  window.wmMegaMenu = {
    init: () => initMegaMenu(),
  };
  window.wmMegaMenu.init();
  window.addEventListener("DOMContentLoaded", initMegaMenu);
})();
