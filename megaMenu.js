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
      closeMenuDelay: 150,
      activeAnimation: "fade",
      activeAnimationDelay: 300,
      closeOnScroll: true,
      allowTriggerClickthrough: true,
      addActiveTriggerClass: false,
      activeDesktopTriggerClass: "header-nav-item--active",
      activeMobileTriggerClass: "header-menu-nav-item--active",
      setTriggerNoFollow: false,
      triggerIconDisplay: true,
      backButtonText: "Back",
      triggerIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>`,

      openOnClick: false,
      positionBelow: "#header", // CSS selector for element to position under, or "trigger" for dynamic positioning under the trigger
      positionOffset: "0px", // Offset from the bottom of the position element (e.g., "10px", "1rem", "0px")
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

  // Add static property to track if global click listener has been attached
  static globalClickListenerAttached = false;

  constructor(els) {
    if (els[0].dataset.megaMenuLoadingState) {
      return;
    } else {
      els.forEach(el => (el.dataset.megaMenuLoadingState = "loading"));
    }
    this.els = els;
    this.settings = wm$.deepMerge({}, wmMegaMenu.defaultSettings, wmMegaMenu.userSettings);

    // Check if device has a fine pointer (mouse) available
    const hasPointer = window.matchMedia("(pointer: fine)").matches;

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
    const self = this;
    wm$.emitEvent("wmMegaMenu:beforeInit", self);
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
      if (document.readyState === "complete") {
        wm$?.reloadSquarespaceLifecycle([this.menu, this.header]);
      } else {
        window.addEventListener("load", () => {
          wm$?.reloadSquarespaceLifecycle([this.menu, this.header]);
        });
      }
    }

    this.activeMenu = this.menus[0];
    this.menu.dataset.sectionTheme = this.activeMenu.colorTheme;
    this.accessibility = this.handleAccessibility();
    this.accessibility.init();
    this.accessibility.addKeyboardOpenAndClosedNavigation();

    this.runHooks("afterInit");
    wm$.emitEvent("wmMegaMenu:ready", self);
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
    let positionElement;
    
    // Handle "trigger" option for dynamic positioning
    if (this.settings.positionBelow === "trigger" && this.activeMenu?.desktopTriggers?.[0]) {
      positionElement = this.activeMenu.desktopTriggers[0];
    } else if (typeof this.settings.positionBelow === "string" && this.settings.positionBelow !== "trigger") {
      // Use custom selector
      positionElement = document.querySelector(this.settings.positionBelow);
      if (!positionElement) {
        console.warn(`wmMegaMenu: Position element "${this.settings.positionBelow}" not found, falling back to #header`);
        positionElement = this.header;
      }
    } else {
      // Default to header
      positionElement = this.header;
    }
    
    const elementRect = positionElement.getBoundingClientRect();
    
    // Parse and apply the offset
    let offsetValue = 0;
    if (this.settings.positionOffset && this.settings.positionOffset !== "0px") {
      // For viewport units, pixel units, rem, em, etc., we can use calc() in CSS
      // But we need to handle the calculation here for the JS positioning
      const offset = this.settings.positionOffset;
      if (offset.endsWith("px")) {
        offsetValue = parseFloat(offset);
      } else if (offset.endsWith("rem")) {
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        offsetValue = parseFloat(offset) * rootFontSize;
      } else if (offset.endsWith("em")) {
        const fontSize = parseFloat(getComputedStyle(this.menu).fontSize);
        offsetValue = parseFloat(offset) * fontSize;
      } else if (offset.endsWith("vh")) {
        offsetValue = (parseFloat(offset) / 100) * window.innerHeight;
      } else if (offset.endsWith("vw")) {
        offsetValue = (parseFloat(offset) / 100) * window.innerWidth;
      }
    }
    
    this.headerBottom = `${elementRect.bottom + offsetValue}px`;
    this.menu.style.setProperty("--header-bottom", this.headerBottom);
  }
  async buildStructure() {
    const isInEditor = window.self !== window.top;
    const currentPath = window.location.pathname;

    const promises = Array.from(this.els).map(async (el, index) => {
      // Support both <a href=""> and <button data-href="">
      const urlSlug = el.getAttribute("href") || el.getAttribute("data-href");
      const hrefValue = el.href || el.getAttribute("data-href");
      const url = new URL(hrefValue, window.location.origin);
      
      let desktopTriggers = document.querySelectorAll(
        `#header .header-inner a[href="${urlSlug}"], #header .header-inner button[data-href="${urlSlug}"]`
      ),
        referenceUrl,
        sourceUrl,
        isDropdown = false,
        keepDefaultMobileMenu = false;

      // If Dropdown
      if (urlSlug.includes("-wm-mega-") && el.classList.contains("header-nav-folder-title")) {
        referenceUrl = "/" + urlSlug.split("-wm-mega-")[1] || "";
        sourceUrl = urlSlug.split("-wm-mega-")[0] || "#";
        keepDefaultMobileMenu = true;
        isDropdown = true;
      } else {
        referenceUrl = urlSlug.split("=")[1] || "";
        if (!referenceUrl.startsWith("/")) {
          referenceUrl = "/" + referenceUrl;
        }
        // Check if the href starts with # for anchor-only links
        sourceUrl = urlSlug.startsWith("#") ? "#" : url.pathname;
      }

      if (!desktopTriggers.length || !referenceUrl) return null;

      const triggerText = desktopTriggers[0].innerText || desktopTriggers[0].textContent;
      const mobileTriggerParent = document.querySelector(
        `#header .header-menu [href="${urlSlug}"], #header .header-menu [data-href="${urlSlug}"]`
      )?.parentElement;
      
      if (!mobileTriggerParent) {
        console.warn(`Mobile trigger parent not found for: ${urlSlug}`);
        return null;
      }

      // Check if we're on the same page as this mega menu's source content
      const isOnSourcePage = isInEditor && currentPath === referenceUrl;

      if (isOnSourcePage) {
        // Create a placeholder message instead of fetching content
        const placeholderFrag = this.createEditorPlaceholder(referenceUrl);
        const colorTheme = this.defaultHeaderColorTheme || "white";
        return {
          order: index + 1,
          triggerText,
          desktopTriggers,
          mobileTriggerParent,
          urlSlug,
          sourceUrl,
          referenceUrl,
          contentFrag: placeholderFrag,
          colorTheme,
          keepDefaultMobileMenu,
          isDropdown,
          isEditorPlaceholder: true,
        };
      }

      try {
        const contentFrag = await wm$?.getFragment(referenceUrl);
        const colorTheme = contentFrag.querySelector(".page-section").dataset.sectionTheme;
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
  createEditorPlaceholder(referenceUrl) {
    const frag = document.createDocumentFragment();
    const section = document.createElement("section");
    section.className = "page-section mega-menu-editor-placeholder";
    section.dataset.sectionTheme = this.defaultHeaderColorTheme || "white";
    
    const wrapper = document.createElement("div");
    wrapper.className = "mega-menu-placeholder-content";
    const homeUrl = window.location.origin + "/";
    wrapper.innerHTML = `
      <div class="mega-menu-placeholder-message">
        <h3>Mega Menu Preview Disabled</h3>
        <p>This mega menu pulls content from the page you're currently editing (<code>${referenceUrl}</code>).</p>
        <p>To prevent editing conflicts, the preview is disabled on this page.</p>
        <p><strong>To test your mega menu:</strong></p>
        <a href="${homeUrl}?noredirect" target="_blank" class="mega-menu-placeholder-link">Open Home Page in New Tab ↗</a>
      </div>
    `;
    section.appendChild(wrapper);
    frag.appendChild(section);
    return frag;
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
        const isButton = el.tagName === "BUTTON";
        const hrefAttr = isButton ? "data-href" : "href";
        
        if (menu.sourceUrl === "/") {
          el.setAttribute(hrefAttr, menu.referenceUrl);
          if (!isButton) {
            el.setAttribute("rel", "nofollow");
          }
          el.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
          });
        } else {
          if (!this.settings.allowTriggerClickthrough) {
            // Prevent Clickthrough
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

          // Add nofollow (only for <a> tags)
          if (this.settings.setTriggerNoFollow && !isButton) {
            el.setAttribute("rel", "nofollow");
          }
          el.setAttribute(hrefAttr, menu.sourceUrl);
        }
      });

      // Add active states to desktop triggers
      const currentPath = window.location.pathname;
      menu.desktopTriggers.forEach(el => {
        if (menu.sourceUrl === currentPath) {
          el.parentElement.classList.add("header-nav-item--active");
        }
      });

      const itemDiv = document.createElement("div");
      itemDiv.className = "mega-menu-item";

      itemDiv.dataset.referenceUrl = menu.referenceUrl;
      menu.contentFrag.querySelectorAll(".page-section").forEach(section => {
        itemDiv.appendChild(section);
      });

      // Add active states to matching links within mega menu content
      itemDiv.querySelectorAll("a").forEach(link => {
        if (!link.href || link.href === "#" || link.getAttribute("href") === "#" || link.getAttribute("href") === "") {
          return;
        }

        // Check if the link href can be parsed as a URL with the current origin as base
        try {
          // Attempt to parse the link's href
          const linkUrl = new URL(link.href, window.location.origin);
          const linkPath = linkUrl.pathname;

          if (linkPath === currentPath) {
            link.classList.add("mega-menu-nav-item--active");
            // Add active class to parent desktop triggers
            menu.desktopTriggers.forEach(trigger => {
              this.settings.addActiveTriggerClass
                ? trigger.parentElement.classList.add(this.settings.activeDesktopTriggerClass)
                : null;
            });
            // Add active class to mobile trigger if it exists
            if (menu.mobileTrigger) {
              this.settings.addActiveTriggerClass
                ? menu.mobileTrigger.classList.add(this.settings.activeMobileTriggerClass)
                : null;
            } else {
              // Store this state for when mobile trigger is created later
              menu.shouldAddMobileActiveClass = true;
            }
          }
        } catch (e) {
          console.warn(`Could not parse URL: ${link.href}`, e);
        }
        // Links with unparseable hrefs (like tel:, mailto:) will be skipped
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
    const self = this;
    this.menus.forEach(menu => {
      const newMobileTrigger = buildMobileTrigger(menu);
      menu.mobileFolder = buildMobileFolder(menu.referenceUrl);
      menu.mobileBackButton = menu.mobileFolder.querySelector('a[data-action="back"]');

      menu.mobileTrigger = null;
      menu.mobileContainer = null;

      if (menu.keepDefaultMobileMenu) return;

      this.mobileFoldersList.append(menu.mobileFolder);
      menu.mobileTriggerParent.innerHTML = "";
      menu.mobileTriggerParent.append(newMobileTrigger);
      menu.mobileTrigger = menu.mobileTriggerParent.querySelector("a");
      menu.mobileContainer = menu.mobileFolder.querySelector(".header-menu-nav-folder-content");
      if (menu.shouldAddMobileActiveClass && this.settings.addActiveTriggerClass) {
        menu.mobileTriggerParent.classList.add(this.settings.activeMobileTriggerClass);
        menu.mobileTrigger.ariaCurrent = "page";
      }
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
      contentDiv.className = "header-menu-nav-item-content header-menu-nav-item-content-folder";

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
      // const chevronSpan = document.createElement("span");
      // chevronSpan.className = "chevron chevron--right";
      // contentDiv.appendChild(chevronSpan);

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
      folder.className = "header-menu-nav-folder mobile-mega-menu-folder site-wrapper";

      // Create the folder content div
      const folderContent = document.createElement("div");
      folderContent.className = "header-menu-nav-folder-content";

      // Create the controls container
      const controlsContainer = document.createElement("div");
      controlsContainer.className = "header-menu-controls container header-menu-nav-item";

      // Create the back button
      let backButton = document.querySelector('.header-menu-controls-control[data-action="back ff"]')?.cloneNode(true);
      if (backButton) {
        backButton = backButton.cloneNode(true);
      } else {
        backButton = createBackButton();
      }

      backButton.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();

        const rootFolder = document.querySelector('[data-folder="root"]');
        const folderToClose = backButton.closest(".header-menu-nav-folder");

        rootFolder.classList.remove("header-menu-nav-folder--open");
        folderToClose.classList.remove("header-menu-nav-folder--active");
      });

      // Assemble the structure
      controlsContainer.appendChild(backButton);
      folderContent.appendChild(controlsContainer);
      folder.appendChild(folderContent);

      return folder;
    }
    function createBackButton(text) {
      const backButton = document.createElement("a");
      backButton.className = "header-menu-controls-control header-menu-controls-control--active";
      backButton.setAttribute("data-action", "back");
      backButton.href = "/";
      backButton.tabIndex = -1;
      const textSpan = document.createElement("span");
      textSpan.textContent = self.settings.backButtonText;
      backButton.appendChild(textSpan);
      return backButton;
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

      // Prevent closing when interacting with form elements in Chrome
      // This handles autofill dropdowns and file picker dialogs which cause
      // mouseleave events with null relatedTarget while keeping focus in the menu
      if (!e.relatedTarget) {
        const activeElement = document.activeElement;
        if (activeElement && this.menuWrapper.contains(activeElement)) {
          const isFormElement = activeElement.matches('input, textarea, select, [contenteditable="true"]');
          if (isFormElement) {
            return;
          }
        }
      }

      this.closeMenu();
    });

    const closeTriggers = this.header.querySelectorAll(".header-inner a, .header-inner button, .header-inner .header-nav-folder-content");
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
              const isActiveTrigger = Array.from(this.activeMenu.desktopTriggers).some(trigger => trigger === el);
              if (!isActiveTrigger) {
                this.closeMenu();
              }
            }, this.settings.closeMenuDelay || 150);
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

    // Only attach global click listener once
    if (!wmMegaMenu.globalClickListenerAttached) {
      document.addEventListener("click", e => {
        if (e.target.closest(".mobile-mega-menu-folder a[href]")) {
          const menuTrigger = document.querySelector("button.header-burger-btn.burger--active");
          if (menuTrigger) {
            menuTrigger.click();
          }
        }
      });
      wmMegaMenu.globalClickListenerAttached = true;
    }
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

            if (Array.from(this.activeMenu.desktopTriggers).some(t => t === trigger) && this.isMenuOpen) {
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
        trigger.closest(".header-nav-item")?.classList.add("header-nav-item--mega-menu");
        if (this.settings.triggerIcon === "squarespace" && document.querySelector("#header[data-current-styles]")) {
          try {
            const headerElement = document.querySelector("#header[data-current-styles]");
            if (!headerElement?.dataset?.currentStyles) {
              console.warn("Header element or currentStyles dataset not found");
              return;
            }

            const headerSettings = headerElement.dataset.currentStyles;
            let iconOptions;

            try {
              const parsedSettings = JSON.parse(headerSettings);
              iconOptions = parsedSettings?.iconOptions;
            } catch (parseError) {
              console.warn("Failed to parse header settings JSON:", parseError);
              return;
            }

            const folderDropdownIcon = iconOptions?.desktopDropdownIconOptions?.folderDropdownIcon;

            if (typeof folderDropdownIcon === "string" && folderDropdownIcon.length > 0) {
              const span = document.createElement("span");
              span.classList.add("mega-menu-dropdown-icon");
              const icon = document.createElement("svg");
              icon.setAttribute("viewBox", "0 0 22 22");

              // Safely set stroke-linecap with validation
              const endcapType = iconOptions?.desktopDropdownIconOptions?.endcapType;
              const validEndcapTypes = ["butt", "round", "square"];
              if (typeof endcapType === "string" && validEndcapTypes.includes(endcapType)) {
                icon.setAttribute("stroke-linecap", endcapType);
              }

              // Always set stroke-linejoin (this is safe as it's a constant)
              icon.setAttribute("stroke-linejoin", "miter");

              // Safely set stroke-width with proper validation
              const strokeWidth = iconOptions?.desktopDropdownIconOptions?.strokeWidth;
              if (
                strokeWidth &&
                typeof strokeWidth.value === "number" &&
                typeof strokeWidth.unit === "string" &&
                strokeWidth.value > 0
              ) {
                icon.setAttribute("stroke-width", strokeWidth.value + strokeWidth.unit);
              }

              // Safely set stroke-width with proper validation
              const iconSize = iconOptions?.desktopDropdownIconOptions?.size;
              if (
                iconSize &&
                typeof iconSize.value === "number" &&
                typeof iconSize.unit === "string" &&
                iconSize.value > 0
              ) {
                span.style.setProperty("width", iconSize.value + iconSize.unit);
                span.style.setProperty("height", iconSize.value + iconSize.unit);
              }

              const use = document.createElement("use");
              use.setAttribute("href", "#" + folderDropdownIcon);
              icon.classList.add("squarespace-icon");

              icon.appendChild(use);
              span.appendChild(icon);
              this.settings.triggerIcon = span.outerHTML;
            } else {
              console.warn("Invalid or missing folderDropdownIcon");
            }
          } catch (error) {
            console.error("Error setting up Squarespace trigger icon:", error);
            // Fallback to default icon behavior
          }
        }
        this.settings.triggerIconDisplay ? trigger.insertAdjacentHTML("beforeend", this.settings.triggerIcon) : null;
      });
    });
  }
  openMenu(menu) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    this.runHooks("beforeOpenMenu", menu);
    wm$.emitEvent("wmMegaMenu:beforeOpenMenu", menu);
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
      if (this.menuTriggerCurrentlyHovered && this.menuTriggerCurrentlyHovered !== menu) {
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
      if (this.menuTriggerCurrentlyHovered && this.menuTriggerCurrentlyHovered !== menu) {
        this.openMenu(this.menuTriggerCurrentlyHovered);
      }
      wm$.emitEvent("wmMegaMenu:afterOpenMenu", menu);
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

        menu.desktopTriggers.forEach(trigger => trigger.parentElement.classList.add("mega-menu--active"));
        menu.item.classList.add("active");
      } else {
        menu.desktopTriggers.forEach(trigger => trigger.parentElement.classList.remove("mega-menu--active"));
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
    const closeAnimation = this.menu.animate(this.getCloseAnimationKeyframes(), {
      duration: this.settings.closeAnimationDelay,
      easing: "ease-in",
      fill: "forwards",
    });

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
        menu.desktopTriggers.forEach(trigger => trigger.parentElement.classList.remove("mega-menu--active"));
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

    const animation = animations[this.settings.openAnimation] || animations.fade;

    if (typeof animation === "function") {
      const distance = this.settings.layout === "inset" ? "-20px" : `-${this.activeMenu.height}px`;
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

    const animation = animations[this.settings.openAnimation] || animations.fade;

    if (typeof animation === "function") {
      const distance = this.settings.layout === "inset" ? "-20px" : `-${this.activeMenu.height}px`;
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
      const menuTriggerRect = menuItem.desktopTriggers[0].getBoundingClientRect();

      this.arrowX = menuTriggerRect.left + menuTriggerRect.width / 2 - arrow.offsetWidth / 2;
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
      return arrow.animate([{left: `${this.arrowX}px`, top: `${this.arrowY}px`}], {
        duration: 300,
        easing: "ease",
        fill: "forwards",
      });
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
    let height = Array.from(this.activeMenu.item.children).reduce((total, child) => {
      return total + child.offsetHeight;
    }, 0);

    // Add the top and bottom border widths
    const menuWrapperStyle = window.getComputedStyle(this.menuWrapper);
    height += parseFloat(menuWrapperStyle.borderTopWidth) + parseFloat(menuWrapperStyle.borderBottomWidth);

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
  parseInsetLimit(limit) {
    // If it's already a number (like 0.04), return it as a proportion
    if (typeof limit === "number") {
      return limit;
    }

    // If it's a string with units (like '20px' or '2vh')
    if (typeof limit === "string") {
      // For viewport units
      if (limit.endsWith("vh")) {
        return parseFloat(limit) / 100;
      }
      if (limit.endsWith("vw")) {
        return parseFloat(limit) / 100;
      }
      // For pixel units, convert to proportion of window width
      if (limit.endsWith("px")) {
        return parseFloat(limit) / window.innerWidth;
      }
      // For rem units
      if (limit.endsWith("rem")) {
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return (parseFloat(limit) * rootFontSize) / window.innerWidth;
      }
      // For em units
      if (limit.endsWith("em")) {
        const fontSize = parseFloat(getComputedStyle(this.menu).fontSize);
        return (parseFloat(limit) * fontSize) / window.innerWidth;
      }
    }

    // Default fallback
    return 0.04;
  }
  setSizing() {
    // Get scrollbar width only if there is a vertical scrollbar
    const getScrollbarWidth = () => {
      const documentWidth = document.documentElement.clientWidth;
      const windowWidth = window.innerWidth;
      return windowWidth - documentWidth;
    };

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

      let width = parseInt(window.getComputedStyle(menu.item).getPropertyValue("--mega-menu-max-width"));
      const scrollbarWidth = getScrollbarWidth();
      const insetLimit = this.parseInsetLimit(this.settings.insetMenuWidthLimit);
      const insetWidthLimit = (window.innerWidth - scrollbarWidth) * (1 - 2 * insetLimit);

      if (width > insetWidthLimit) {
        width = insetWidthLimit;
      }
      if (this.settings.layout !== "inset") {
        width = window.innerWidth - scrollbarWidth;
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

    const insetLimit = this.parseInsetLimit(this.settings.insetMenuWidthLimit);
    const inset = window.innerWidth * insetLimit;
    const windowRightEdge = window.innerWidth - inset;
    const windowLeftEdge = inset;
    const menuWrapperWidth = this.activeMenu.width;

    const activeTrigger = this.activeMenu.desktopTriggers[0];
    let translateX = 0;

    if (this.headerCurrentStyles?.layout === "navLeft" || this.headerCurrentStyles?.layout === "brandingCenter") {
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
    const currentTranslateX = currentTransform !== "none" ? parseFloat(currentTransform.split(",")[4]) : 0;

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
    if (this.isMobileMenuOpen || document.body.classList.contains("header--menu-open")) {
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
          if (this.settings.closeOnScroll) {
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
      this.revertColorTheme();
      window.setTimeout(() => {
        if (e.target.closest("button").matches(".burger--active")) {
          this.isMobileMenuOpen = true;
          this.revertColorTheme();
        } else {
          this.isMobileMenuOpen = false;
          const rootFolder = document.querySelector('.header-menu-nav-list [data-folder="root"]');
          const otherFolders = document.querySelectorAll(
            '.header-menu-nav-list [data-folder]:not([data-folder="root"])'
          );
          rootFolder.classList.remove("header-menu-nav-folder--open");
          otherFolders.forEach(folder => {
            folder.classList.remove("header-menu-nav-folder--active");
          });
          this.revertColorTheme();
        }
        this.placeMegaMenusByScreenSize();
      }, 400);
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
      return el.offsetWidth > 0 && el.offsetHeight > 0 && getComputedStyle(el).visibility !== "hidden" && !el.disabled;
    };

    const trapFocus = menu => {
      const focusableElements = Array.from(menu.focusableElements).filter(isElementFocusable);
      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];

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
      `.header-display-desktop .header-nav-list a[href*='#wm-mega']:not([data-mega-menu-loading-state]), 
      .header-display-desktop .header-nav-list button[data-href*='#wm-mega']:not([data-mega-menu-loading-state]),
      .header-display-desktop .header-nav-list .header-nav-item--folder a[href*='-wm-mega-']:not([data-mega-menu-loading-state]),
      .header-display-desktop .header-nav-list .header-nav-item--folder button[data-href*='-wm-mega-']:not([data-mega-menu-loading-state]),
      [data-wm-plugin="secondary-nav"] .secondary-links a[href*='#wm-mega']:not([data-mega-menu-loading-state]),
      [data-wm-plugin="secondary-nav"] .secondary-links button[data-href*='#wm-mega']:not([data-mega-menu-loading-state])`
    );
    if (!els.length) return;
    new wmMegaMenu(els);
  }
  window.wmMegaMenu = {
    init: () => initMegaMenu(),
  };
  if (!document.querySelector("SecondaryNav")) {
    window.wmMegaMenu.init();
  }
  window.addEventListener("DOMContentLoaded", initMegaMenu);
})();
