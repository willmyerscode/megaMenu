class wmMegaMenu {
  static get pluginTitle() {
    return "wmMegaMenu";
  }
  static get defaultSettings() {
    return {
      layout: "full-width", // header-adapt or folder
      openAnimation: "slide", // or fade, slide, swing
      openAnimationDelay: 300,
      insetMenuWidthLimit: 0.04,
      closeAnimationDelay: 300,
      activeAnimation: "fade",
      activeAnimationDelay: 300,
      allowTriggerClickthrough: true,
      setTriggerNoFollow: false,
      triggerIconDisplay: true,
      triggerIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>`,
      openOnClick: false,
      hooks: {
        beforeInit: [],
        afterInit: [
          function () {
            wm$?.initializeAllPlugins();
          },
        ],
        beforeOpenMenu: [],
        afterOpenMenu: [],
        beforeCloseMenu: [],
        afterCloseMenu: [],
      },
    };
  }
  static get userSettings() {
    return window[wmMegaMenu.pluginTitle + "Settings"] || {};
  }
  constructor(els) {
    if (els[0].dataset.megaMenuLoadingState) {
      return;
    } else {
      els.forEach(el => (el.dataset.megaMenuLoadingState = "loading"));
    }
    this.els = els;
    this.settings = wm$.deepMerge(
      {},
      wmMegaMenu.defaultSettings,
      wmMegaMenu.userSettings
    );

    // Check if device has a fine pointer (mouse) available
    const hasPointer = window.matchMedia('(pointer: fine)').matches;
    
    // If device does not have a fine pointer (mouse), force openOnClick
    if (!hasPointer) {
      this.settings.openOnClick = true;
    }

    this.menus = [];
    this.isMenuOpen = false;
    this.isMobileMenuOpen = false;
    this.menuTriggerCurrentlyHovered = null;

    this.headerBottom = 0;
    this.header = document.querySelector("#header");
    this.mobileHeader = this.header.querySelector(".header-menu");
    this.headerContext = JSON.parse(this.header.dataset.currentStyles);
    this.mobileMenuOverlayTheme = this.headerContext.menuOverlayTheme;

    this.siteWrapper = document.querySelector("#siteWrapper");
    this.page = document.querySelector("#page");
    this.mobileFoldersList = this.header.querySelector(".header-menu-nav-list");

    this.defaultHeaderColorTheme = this.header.dataset.sectionTheme;

    // Ensure allowTriggerClickthrough is disabled if openOnClick is enabled
    if (this.settings.openOnClick) {
      this.settings.allowTriggerClickthrough = false;
    }

    this.isAnimating = false;

    this.init();
  }
  async init() {
    this.runHooks("beforeInit");

    await this.buildStructure();
    this.buildDesktopHTML();
    this.buildMobileHTML();
    this.setSizing();
    this.bindEvents();
    this.isHamburgerMenuOpen = false;
    this.placeMegaMenusByScreenSize();
    this.headerCurrentStyles = JSON.parse(this.header.dataset.currentStyles);
    if (window.Squarespace) {
      wm$?.handleAddingMissingColorTheme();
      await wm$?.reloadSquarespaceLifecycle([this.menu, this.header]);
    }

    this.activeMenu = this.menus[0];
    this.menu.dataset.sectionTheme = this.activeMenu.colorTheme;
    this.accessibility = this.handleAccessibility();
    this.accessibility.init();
    this.accessibility.addKeyboardOpenAndClosedNavigation();

    this.runHooks("afterInit");
  }
  bindEvents() {
    this.addEditModeObserver();
    this.addOpenTriggers();
    this.addCloseTriggers();
    this.addMobileOpenTriggers();
    this.addMobileBackButtonClick();
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
    const promises = Array.from(this.els).map(async (el, index) => {
      const url = new URL(el.href);
      const urlSlug = el.getAttribute("href");
      let desktopTriggers = document.querySelectorAll(
          `#header .header-inner [href="${urlSlug}"]`
        ),
        referenceUrl,
        sourceUrl,
        isDropdown = false,
        keepDefaultMobileMenu = false;

      // If Dropdown
      if (
        urlSlug.includes("-wm-mega-") &&
        el.classList.contains("header-nav-folder-title")
      ) {
        referenceUrl = "/" + urlSlug.split("-wm-mega-")[1] || "";
        sourceUrl = urlSlug.split("-wm-mega-")[0] || "";
        keepDefaultMobileMenu = true;
        isDropdown = true;
      } else {
        referenceUrl = urlSlug.split("=")[1] || "";
        sourceUrl = url.pathname;
      }

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
          order: index + 1,
          triggerText,
          desktopTriggers,
          mobileTriggerParent,
          urlSlug,
          sourceUrl,
          referenceUrl,
          contentFrag,
          colorTheme,
          keepDefaultMobileMenu,
          isDropdown,
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

    const absoluteMenu = document.createElement("div");
    absoluteMenu.className = "mega-menu-absolute";
    this.absoluteMenu = absoluteMenu;

    const pageOverlay = document.createElement("div");
    pageOverlay.className = "mega-menu-page-overlay";
    this.pageOverlay = pageOverlay;

    const arrow = document.createElement("div");
    arrow.className = "mega-menu-arrow";
    this.arrow = arrow;

    this.menus.forEach(menu => {
      menu.desktopTriggers.forEach(el => {
        if (menu.sourceUrl === "/") {
          el.setAttribute("href", menu.referenceUrl);
          el.setAttribute("rel", "nofollow");
          el.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
          });
        } else {
          // Prevent Clickthrough
          if (!this.settings.allowTriggerClickthrough) {
            el.addEventListener("click", e => {
              e.preventDefault();
              e.stopPropagation();
            });
          }

          if (menu.isDropdown && this.settings.allowTriggerClickthrough) {
            el.addEventListener("click", e => {
              window.location.href = menu.sourceUrl;
            });
          }

          // Add nofollow
          if (this.settings.setTriggerNoFollow) {
            el.setAttribute("rel", "nofollow");
          }
          el.setAttribute("href", menu.sourceUrl);
        }
      });

      const itemDiv = document.createElement("div");
      itemDiv.className = "mega-menu-item";

      itemDiv.dataset.referenceUrl = menu.referenceUrl;
      menu.contentFrag.querySelectorAll(".page-section").forEach(section => {
        itemDiv.appendChild(section);
      });

      absoluteMenu.appendChild(itemDiv);
      menu.item = itemDiv;
    });

    wrapperDiv.appendChild(absoluteMenu);
    megaMenuDiv.appendChild(wrapperDiv);
    megaMenuDiv.appendChild(arrow);
    container.appendChild(megaMenuDiv);

    this.header.appendChild(container);
    this.positionMenuWrapper();
  }
  buildMobileHTML() {
    this.menus.forEach(menu => {
      const newMobileTrigger = buildMobileTrigger(menu);
      menu.mobileFolder = buildMobileFolder(menu.referenceUrl);
      menu.mobileBackButton = menu.mobileFolder.querySelector(
        'a[data-action="back"]'
      );

      menu.mobileTrigger = null;
      menu.mobileContainer = null;

      if (menu.keepDefaultMobileMenu) return;

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
      mobileLink.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();

        const rootFolder = mobileLink.closest('[data-folder="root"]');
        const folderToOpen = document.querySelector(
          `.header-menu-nav-folder[data-folder="${mobileLink.dataset.folderId}"]`
        );

        rootFolder.classList.add("header-menu-nav-folder--open");
        folderToOpen.classList.add("header-menu-nav-folder--active");
      });

      return mobileLink;
    }
    function buildMobileFolder(folderPath = "/demo-url") {
      // Create the main container div
      const folder = document.createElement("div");
      folder.setAttribute("data-folder", folderPath);
      folder.className =
        "header-menu-nav-folder mobile-mega-menu-folder site-wrapper";

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

      backButton.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();

        const rootFolder = document.querySelector('[data-folder="root"]');
        const folderToClose = backButton.closest(".header-menu-nav-folder");

        rootFolder.classList.remove("header-menu-nav-folder--open");
        folderToClose.classList.remove("header-menu-nav-folder--active");
      });

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
      if (!this.settings.openOnClick) {
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
      }

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
      this.positionMenuWrapper();
      window.setTimeout(() => {
        this.setSizing();
        this.positionMenuWrapper();
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
      if (menu.keepDefaultMobileMenu) return;
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

        if (this.settings.openOnClick) {
          trigger.addEventListener("click", e => {
            e.preventDefault();

            if (
              Array.from(this.activeMenu.desktopTriggers).some(
                t => t === trigger
              ) &&
              this.isMenuOpen
            ) {
              this.closeMenu();
            } else {
              this.openMenu(menu);
            }
          });
          
        } else {
          trigger.addEventListener("mouseenter", () => {
            this.menuTriggerCurrentlyHovered = menu;
            openTimeout = setTimeout(() => {
              this.openMenu(menu);
            }, 80);
          });

          trigger.addEventListener("mouseleave", () => {
            clearTimeout(openTimeout);
            this.menuTriggerCurrentlyHovered = null;
          });
        }

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
    if (this.isAnimating) return;
    this.isAnimating = true;

    this.runHooks("beforeOpenMenu", menu);
    if (this.isMenuOpen && this.activeMenu === menu) {
      this.isAnimating = false;
      return;
    }
    this.activeMenu = menu;
    this.updateHeaderBottom();
    this.setSizing();
    if (this.settings.layout === "full-width") {
      this.matchColorTheme();
    }
    if (!this.isMenuOpen && this.settings.layout === "inset") {
      this.handleInsetMenuPositioning(true);
    }
    this.positionMenuWrapper();

    this.handleArrowAnimation("move");

    // Update ARIA attributes
    menu.desktopTriggers.forEach(trigger => {
      trigger.setAttribute("aria-expanded", "true");
    });

    // Start the opening animation using Web Animations API
    if (this.isMenuOpen) {
      this.showActiveMenu();
      this.isAnimating = false;
      if (
        this.menuTriggerCurrentlyHovered &&
        this.menuTriggerCurrentlyHovered !== menu
      ) {
        this.openMenu(this.menuTriggerCurrentlyHovered);
      }
      return;
    }

    const openAnimation = this.menu.animate(this.getOpenAnimationKeyframes(), {
      duration: this.settings.openAnimationDelay,
      easing: "ease-out",
      fill: "forwards",
    });

    // Add classes for any CSS-based styling
    this.menu.classList.add("open");
    this.addPageOverlay();
    document.body.classList.add("wm-mega-menu--open");

    // Wait for the animation to finish before showing the active menu
    openAnimation.onfinish = () => {
      this.handleArrowAnimation("open");
      this.showActiveMenu();
      this.isMenuOpen = true;
      this.isAnimating = false;
      if (
        this.menuTriggerCurrentlyHovered &&
        this.menuTriggerCurrentlyHovered !== menu
      ) {
        this.openMenu(this.menuTriggerCurrentlyHovered);
      }
      this.runHooks("afterOpenMenu", menu);
    };
  }
  showActiveMenu() {
    this.menu.dataset.sectionTheme = this.activeMenu.colorTheme;
    if (this.settings.layout === "inset") {
      this.handleInsetMenuPositioning();
    }

    this.positionMenuWrapper();
    this.menu.dataset.activeMenu = this.activeMenu.referenceUrl;

    this.menus.forEach(menu => {
      if (this.activeMenu === menu) {
        this.handleArrowAnimation("move");

        menu.desktopTriggers.forEach(trigger =>
          trigger.parentElement.classList.add("mega-menu--active")
        );
        menu.item.classList.add("active");
      } else {
        menu.desktopTriggers.forEach(trigger =>
          trigger.parentElement.classList.remove("mega-menu--active")
        );
        menu.item.classList.remove("active");
      }
    });
  }
  closeMenu() {
    if (this.isAnimating) return;
    this.isAnimating = true;

    this.runHooks("beforeCloseMenu");

    if (!this.isMenuOpen) {
      this.isAnimating = false;
      return;
    }

    // Start the closing animation using Web Animations API
    const closeAnimation = this.menu.animate(
      this.getCloseAnimationKeyframes(),
      {
        duration: this.settings.closeAnimationDelay,
        easing: "ease-in",
        fill: "forwards",
      }
    );

    this.handleArrowAnimation("close");

    // Wait for the animation to finish before cleaning up
    closeAnimation.onfinish = () => {
      this.menu.classList.remove("open");
      document.body.classList.remove("wm-mega-menu--open");
      document.body.classList.remove("wm-mega-menu-open-animation-complete");
      this.removePageOverlay();
      this.isMenuOpen = false;
      this.isAnimating = false;

      if (this.settings.layout !== "inset") {
        this.revertColorTheme();
      }

      this.menus.forEach(menu => {
        menu.desktopTriggers.forEach(trigger =>
          trigger.parentElement.classList.remove("mega-menu--active")
        );
        menu.item.classList.remove("active");
      });

      this.runHooks("afterCloseMenu");
    };
  }
  getOpenAnimationKeyframes() {
    const animations = {
      fade: [
        {opacity: 0, visibility: "hidden"},
        {opacity: 1, visibility: "visible"},
      ],
      slide: distance => [
        {
          transform: `translateY(${distance})`,
          opacity: 0,
          visibility: "hidden",
        },
        {transform: "translateY(0)", opacity: 1, visibility: "visible"},
      ],
      swing: [
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
      ],
    };

    const animation =
      animations[this.settings.openAnimation] || animations.fade;

    if (typeof animation === "function") {
      const distance =
        this.settings.layout === "inset"
          ? "-20px"
          : `-${this.activeMenu.height}px`;
      return animation(distance);
    }

    return animation;
  }
  getCloseAnimationKeyframes() {
    const animations = {
      fade: [
        {opacity: 1, visibility: "visible"},
        {opacity: 0, visibility: "hidden"},
      ],
      slide: distance => [
        {transform: "translateY(0)", opacity: 1, visibility: "visible"},
        {
          transform: `translateY(${distance})`,
          opacity: 0,
          visibility: "hidden",
        },
      ],
      swing: [
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
      ],
    };

    const animation =
      animations[this.settings.openAnimation] || animations.fade;

    if (typeof animation === "function") {
      const distance =
        this.settings.layout === "inset"
          ? "-20px"
          : `-${this.activeMenu.height}px`;
      return animation(distance);
    }

    return animation;
  }
  handleArrowAnimation(action = "open") {
    const arrow = this.arrow;
    const setArrowPosition = () => {
      const arrow = this.arrow;
      const menuWrapper = this.menuWrapper;
      const menuItem = this.activeMenu;

      const menuWrapperRect = menuWrapper.getBoundingClientRect();
      const menuTriggerRect =
        menuItem.desktopTriggers[0].getBoundingClientRect();

      this.arrowX =
        menuTriggerRect.left +
        menuTriggerRect.width / 2 -
        arrow.offsetWidth / 2;
      this.arrowY = menuWrapperRect.top - arrow.offsetHeight / 2;
    };

    if (action === "open") {
      setArrowPosition();
      this.arrow.style.left = `${this.arrowX}px`;
      this.arrow.style.top = `${this.arrowY}px`;
      this.arrow.style.opacity = 0;
      return arrow.animate(
        [
          {opacity: 0, transform: "translateY(200px) rotate(45deg)"},
          {opacity: 1, transform: "translateY(0px) rotate(45deg)"},
        ],
        {
          duration: 300,
          easing: "ease",
          fill: "forwards",
        }
      );
    } else if (action === "move") {
      setArrowPosition();
      return arrow.animate(
        [{left: `${this.arrowX}px`, top: `${this.arrowY}px`}],
        {
          duration: 300,
          easing: "ease",
          fill: "forwards",
        }
      );
    } else if (action === "close") {
      return arrow.animate(
        [
          {opacity: 1, transform: "translateY(0px) rotate(45deg)"},
          {opacity: 0, transform: "translateY(15px) rotate(45deg)"},
        ],
        {
          duration: 300,
          easing: "ease",
          fill: "forwards",
        }
      );
    }
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
    if (this.settings.layout === "inset" && !this.isMobileMenuOpen) return;
    this.header.dataset.sectionTheme = this.activeMenu.colorTheme;
    this.mobileHeader.dataset.sectionTheme = this.activeMenu.colorTheme;
  }
  revertColorTheme() {
    this.menu.dataset.sectionTheme = this.defaultHeaderColorTheme;
    if (this.settings.layout === "inset" && !this.isMobileMenuOpen) return;
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
  positionMenuWrapper() {
    this.menu.style.setProperty("--active-menu-height", "0px");

    let left = 0;
    for (const menu of this.menus) {
      if (menu === this.activeMenu) {
        break;
      }
      left += menu.width;
    }

    // const height = this.activeMenu.height;
    let height = Array.from(this.activeMenu.item.children).reduce(
      (total, child) => {
        return total + child.offsetHeight;
      },
      0
    );

    // Add the top and bottom border widths
    const menuWrapperStyle = window.getComputedStyle(this.menuWrapper);
    height +=
      parseFloat(menuWrapperStyle.borderTopWidth) +
      parseFloat(menuWrapperStyle.borderBottomWidth);

    const width = this.activeMenu.width;

    this.menu.style.setProperty("--active-menu-height", height + "px");
    this.menuWrapper.style.width = width + "px";

    // Force a reflow to ensure DOM updates
    this.menuWrapper.offsetHeight;

    if (this.settings.layout !== "inset") {
      this.menuWrapper.style.width = "100%";
    }

    // Use transform to move the content instead of scrollLeft
    requestAnimationFrame(() => {
      this.absoluteMenu.style.transform = `translateX(-${left}px)`;
    });
  }
  setSizing() {
    this.menus.forEach(menu => {
      menu.item.style.width = ``;
    });
    this.menuWrapper.offsetHeight;

    let absoluteWidth = 0;
    this.menus.forEach(menu => {
      const height = Array.from(menu.item.children).reduce((total, child) => {
        return total + child.offsetHeight;
      }, 0);
      menu.height = height;

      let width = parseInt(
        window
          .getComputedStyle(menu.item)
          .getPropertyValue("--mega-menu-max-width")
      );
      const insetWidthLimit =
        window.innerWidth * (1 - 2 * this.settings.insetMenuWidthLimit);
      if (width > insetWidthLimit) {
        width = insetWidthLimit;
      }
      if (this.settings.layout !== "inset") {
        width = window.innerWidth;
      }
      menu.width = width;
      menu.item.style.width = `${width}px`;
      absoluteWidth += width;
    });
    this.absoluteMenu.style.width = `${absoluteWidth}px`;
  }
  handleInsetMenuPositioning(shouldJump = false) {
    this.setSizing();
    this.positionMenuWrapper();
    if (shouldJump) {
      this.menuWrapper.style.transition = "none";
    }

    const inset = window.innerWidth * 0.04;
    const windowRightEdge = window.innerWidth - inset;
    const windowLeftEdge = inset;
    const menuWrapperWidth = this.activeMenu.width;

    const activeTrigger = this.activeMenu.desktopTriggers[0];
    let translateX = 0;

    if (
      this.headerCurrentStyles?.layout === "navLeft" ||
      this.headerCurrentStyles?.layout === "brandingCenter"
    ) {
      const triggerRect = activeTrigger.getBoundingClientRect();

      translateX = triggerRect.left - 34;

      // Check if it's overlapping the left edge
      if (translateX < windowLeftEdge) {
        const overlap = windowLeftEdge - translateX;
        translateX = translateX + overlap;
      }

      // Check if it's overlapping the right edge
      if (translateX + menuWrapperWidth > windowRightEdge) {
        const overlap = translateX + menuWrapperWidth - windowRightEdge;
        translateX = translateX - overlap - inset;
        if (translateX < windowLeftEdge) {
          translateX = windowLeftEdge;
        }
      }
    } else if (this.headerCurrentStyles?.layout === "navRight") {
      const triggerRect = activeTrigger.getBoundingClientRect();

      translateX = triggerRect.right + 34 - menuWrapperWidth;

      // Check if it's overlapping the right edge
      if (translateX + menuWrapperWidth > windowRightEdge) {
        const overlap = translateX + menuWrapperWidth - windowRightEdge;
        translateX = translateX - overlap;
      }

      // Check if it's overlapping the left edge
      if (translateX < windowLeftEdge) {
        const overlap = windowLeftEdge - translateX;
        translateX = inset;
      }
    } else if (
      this.headerCurrentStyles?.layout === "navCenter" ||
      this.headerCurrentStyles?.layout === "brandingCenterNavCenter"
    ) {
      const triggerRect = activeTrigger.getBoundingClientRect();
      const triggerCenter = triggerRect.left + triggerRect.width / 2;

      // Initially center the menu wrapper below the trigger
      translateX = triggerCenter - menuWrapperWidth / 2;

      // Check for right edge overlap
      if (translateX + menuWrapperWidth > windowRightEdge) {
        translateX = windowRightEdge - menuWrapperWidth - inset;
      }

      // Check for left edge overlap
      if (translateX < windowLeftEdge) {
        translateX = windowLeftEdge;
      }
    }

    // Get the current transform value
    const computedStyle = window.getComputedStyle(this.menuWrapper);
    const currentTransform = computedStyle.transform;
    const currentTranslateX =
      currentTransform !== "none"
        ? parseFloat(currentTransform.split(",")[4])
        : 0;

    // Calculate the new transform
    const newTransform = `translateX(${translateX}px)`;
    this.menuWrapper.style.transform = newTransform;
    this.setSizing();

    if (shouldJump) {
      this.menuWrapper.offsetHeight;

      setTimeout(() => {
        this.menuWrapper.style.transition = "";
      }, 0);
    }
  }
  addResizeEventListener() {
    const handleResize = () => {
      this.closeMenu();
      this.placeMegaMenusByScreenSize();
      this.setSizing();
    };
    window.addEventListener("resize", handleResize);
  }
  placeMegaMenusByScreenSize() {
    if (this.isMobileMenuOpen) {
      this.menus.forEach(menu => {
        if (!menu.keepDefaultMobileMenu) {
          menu.mobileFolder.append(menu.item);
        }
      });
    } else {
      this.menus.sort((a, b) => a.order - b.order);
      this.absoluteMenu.innerHTML = "";
      this.menus.forEach(menu => {
        this.absoluteMenu.append(menu.item);
      });
    }
  }
  addPageOverlay() {
    this.page.prepend(this.pageOverlay);
  }
  removePageOverlay() {
    window.setTimeout(() => {
      if (this.pageOverlay && !this.isMenuOpen) {
        this.pageOverlay.remove();
      }
    }, this.settings.openAnimationDelay);
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
      window.setTimeout(() => {
        if (e.target.closest("button").matches(".burger--active")) {
          this.isMobileMenuOpen = true;
          const rootFolder = document.querySelector('.header-menu-nav-list [data-folder="root"]');
          const otherFolders = document.querySelectorAll('.header-menu-nav-list [data-folder]:not([data-folder="root"])');
          rootFolder.classList.remove('header-menu-nav-folder--open');
          otherFolders.forEach(folder => {
            folder.classList.remove('header-menu-nav-item--folder--active');
          });
          this.revertColorTheme();
        } else {
          this.isMobileMenuOpen = false;
          this.revertColorTheme();
        }
        this.placeMegaMenusByScreenSize();
      }, 50);
    };
    burgers.forEach(burger => burger.addEventListener("click", handleClick));
  }

  get activeMenu() {
    return this._activeMenu;
  }
  set activeMenu(menu) {
    this._activeMenu = menu;
  }

  handleAccessibility() {
    const isElementFocusable = el => {
      // Check if the element is visible and not disabled
      return (
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        getComputedStyle(el).visibility !== "hidden" &&
        !el.disabled
      );
    };

    const trapFocus = menu => {
      const focusableElements = Array.from(menu.focusableElements).filter(
        isElementFocusable
      );
      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement =
        focusableElements[focusableElements.length - 1];

      focusableElements.forEach(el => {
        el.removeAttribute("tabindex");
      });

      function handleKeyDown(e) {
        const isTabPressed = e.key === "Tab" || e.keyCode === 9;

        if (!isTabPressed) return;

        if (e.shiftKey) {
          if (document.activeElement === firstFocusableElement) {
            lastFocusableElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastFocusableElement) {
            firstFocusableElement.focus();
            e.preventDefault();
          }
        }
      }

      menu.item.removeEventListener("keydown", handleKeyDown);
      menu.item.addEventListener("keydown", handleKeyDown);
    };

    const addKeyboardOpenAndClosedNavigation = () => {
      window.addEventListener("keydown", e => {
        if (e.key === "Escape") {
          this.closeMenu();
          this.activeMenu.desktopTriggers[0].focus();
          this.activeMenu.focusableElements.forEach(el => {
            el.setAttribute("tabindex", "-1");
          });
        }
      });

      // Add keyboard support
      this.menus.forEach(menu => {
        menu.desktopTriggers.forEach(trigger => {
          trigger.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
              if (this.isMenuOpen) {
                this.closeMenu();
                return;
              }
              e.preventDefault();
              this.lastFocus = document.activeElement;
              this.menu.setAttribute("aria-hidden", false);
              this.openMenu(menu);
              window.setTimeout(() => {
                if (menu.firstFocusableElement) {
                  trapFocus(menu);
                  menu.firstFocusableElement.focus();
                }
              }, 300);
            }
          });
        });
      });
    };

    const init = () => {
      this.menus.forEach(menu => {
        const item = menu.item;
        const focusableElements = item.querySelectorAll(
          'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
        );
        focusableElements.forEach(el => {
          el.setAttribute("tabindex", "-1");
        });
        menu.focusableElements = focusableElements;
        menu.firstFocusableElement = focusableElements[0];
      });
    };

    return {
      addKeyboardOpenAndClosedNavigation,
      init,
    };
  }
  // Add a new method for keyboard navigation within the menu
}

(() => {
  function initMegaMenu() {
    // const els = document.querySelectorAll("[data-mega-menu]");
    const els = document.querySelectorAll(
      ".header-display-desktop .header-nav-list a[href*='#wm-mega'], .header-display-desktop .header-nav-list .header-nav-item--folder a[href*='-wm-mega-']"
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
