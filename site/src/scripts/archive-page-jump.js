for (const form of document.querySelectorAll("[data-archive-page-jump]")) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!(form instanceof HTMLFormElement) || !form.reportValidity()) {
      return;
    }

    const input = form.querySelector("input[name='page']");
    const browseUrl = form.dataset.browseUrl;
    const lastPage = Number.parseInt(form.dataset.lastPage ?? "", 10);
    const pageNumber = input instanceof HTMLInputElement ? Number.parseInt(input.value, 10) : Number.NaN;
    if (browseUrl === undefined || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > lastPage) {
      return;
    }

    window.location.assign(pageNumber === 1 ? browseUrl : `${browseUrl}${pageNumber}/`);
  });
}
