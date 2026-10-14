(function () {
  "use strict";

  var root = document.documentElement;
  var images = document.querySelectorAll(".hero__photo, .hero__logo");

  function reveal() {
    root.classList.add("is-ready");
  }

  var fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();

  var imageReady = Promise.all(Array.prototype.map.call(images, function (image) {
    if (image.complete) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      image.addEventListener("load", function () {
        resolve();
      }, { once: true });

      image.addEventListener("error", function () {
        resolve();
      }, { once: true });
    });
  }));

  var timeout = new Promise(function (resolve) {
    window.setTimeout(resolve, 2500);
  });

  Promise.race([Promise.all([fontsReady, imageReady]), timeout]).then(reveal);

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        return undefined;
      });
    });
  }
})();

(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (!toggle || !nav) {
    return;
  }

  var desktop = window.matchMedia("(min-width: 720px)");
  var backdrop = document.createElement("button");
  backdrop.className = "nav-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "סגירת תפריט");
  document.body.appendChild(backdrop);

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "סגירת תפריט" : "פתיחת תפריט");
    nav.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  }

  toggle.addEventListener("click", function () {
    var open = toggle.getAttribute("aria-expanded") === "true";
    setOpen(!open);
    if (!open) {
      var firstLink = nav.querySelector("a");
      if (firstLink) {
        firstLink.focus();
      }
    }
  });

  backdrop.addEventListener("click", function () {
    setOpen(false);
    toggle.focus();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });

  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) {
      setOpen(false);
    }
  });

  function closeOnDesktop() {
    if (desktop.matches) {
      setOpen(false);
    }
  }

  if (desktop.addEventListener) {
    desktop.addEventListener("change", closeOnDesktop);
  }
})();

(function () {
  "use strict";

  var catalog = document.getElementById("service-catalog");
  var status = document.getElementById("service-selection");
  if (!catalog || !status) {
    return;
  }

  var data = window.VIP_DEMO;
  var services = data && data.services ? data.services : [];
  var svgNs = "http://www.w3.org/2000/svg";
  var selectedId = "";

  function svgEl(name, attrs) {
    var node = document.createElementNS(svgNs, name);
    Object.keys(attrs).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function lineIcon(children) {
    var svg = svgEl("svg", {
      viewBox: "0 0 48 48",
      fill: "none",
      "aria-hidden": "true",
      focusable: "false"
    });
    children.forEach(function (child) {
      svg.appendChild(child);
    });
    return svg;
  }

  function stroke(attrs) {
    attrs.fill = "none";
    attrs.stroke = "currentColor";
    attrs["stroke-width"] = "1.4";
    attrs["stroke-linecap"] = "round";
    attrs["stroke-linejoin"] = "round";
    return attrs;
  }

  function serviceIcon(id) {
    if (id === "mens-haircut") {
      return lineIcon([
        svgEl("circle", stroke({ cx: "15", cy: "33", r: "5.2" })),
        svgEl("circle", stroke({ cx: "33", cy: "33", r: "5.2" })),
        svgEl("path", stroke({ d: "M19.2 29.6 34.5 12" })),
        svgEl("path", stroke({ d: "M28.8 29.6 13.5 12" }))
      ]);
    }

    if (id === "beard") {
      return lineIcon([
        svgEl("path", stroke({ d: "M8 34.5 29 13.5" })),
        svgEl("path", stroke({ d: "M29 11.5h9.5v7.2H29z" })),
        svgEl("path", stroke({ d: "M31.2 18.7 36 14" }))
      ]);
    }

    if (id === "kids-haircut") {
      return lineIcon([
        svgEl("path", stroke({ d: "M14 10h6.2v28H14z" })),
        svgEl("path", stroke({ d: "M14 15.5H10.5M14 21H10.5M14 26.5H10.5M14 32H10.5" })),
        svgEl("path", stroke({ d: "M20.2 12.5h14.5M20.2 35.5h14.5" }))
      ]);
    }

    return lineIcon([
      svgEl("path", stroke({ d: "M8 32 12.5 16l7.2 8L24 12l4.3 12 7.2-8L40 32z" })),
      svgEl("path", stroke({ d: "M8 36.5h32" }))
    ]);
  }

  function priceLabel(service) {
    if (service.priceOnRequest || service.priceIls === null || service.priceIls === undefined) {
      return "מחיר בתיאום";
    }
    return service.priceIls + " ₪";
  }

  function paintSelection() {
    var cards = catalog.querySelectorAll(".service-card");
    Array.prototype.forEach.call(cards, function (card) {
      var on = card.getAttribute("data-service-id") === selectedId;
      card.classList.toggle("is-selected", on);
      var button = card.querySelector("button");
      if (button) {
        button.setAttribute("aria-pressed", on ? "true" : "false");
      }
    });

    if (!selectedId) {
      status.textContent = "";
      return;
    }

    var chosen = null;
    services.forEach(function (service) {
      if (service.id === selectedId) {
        chosen = service;
      }
    });

    if (!chosen) {
      status.textContent = "";
      return;
    }

    status.textContent = "נבחר להדגמה: " + chosen.name + ". הבחירה נשארת בעמוד הזה בלבד, בלי הזמנה.";
  }

  if (!services.length) {
    var empty = document.createElement("p");
    empty.className = "services-fallback";
    empty.textContent = "רשימת השירותים לא זמינה כרגע.";
    catalog.appendChild(empty);
    return;
  }

  services.forEach(function (service) {
    var card = document.createElement("article");
    card.className = "service-card";
    card.setAttribute("data-service-id", service.id);

    var mark = document.createElement("div");
    mark.className = "service-card__mark";
    mark.appendChild(serviceIcon(service.id));

    var title = document.createElement("h3");
    title.textContent = service.name;

    var summary = document.createElement("p");
    summary.textContent = service.summary || "";

    var price = document.createElement("p");
    price.className = "service-card__price";
    if (service.priceOnRequest || service.priceIls === null || service.priceIls === undefined) {
      price.classList.add("service-card__price--request");
    }
    price.textContent = priceLabel(service);

    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--gold";
    button.textContent = "בחירת השירות";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "בחירת השירות: " + service.name);
    button.addEventListener("click", function () {
      selectedId = selectedId === service.id ? "" : service.id;
      paintSelection();
    });

    card.appendChild(mark);
    card.appendChild(title);
    card.appendChild(summary);
    card.appendChild(price);
    card.appendChild(button);
    catalog.appendChild(card);
  });
})();
