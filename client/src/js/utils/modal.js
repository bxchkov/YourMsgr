export class Modal {
  constructor(selector) {
    this.modal = document.querySelector(selector);
  }

  open() {
    this.modal?.classList.add("active");
  }

  close() {
    this.modal?.classList.remove("active");
  }

  toggle() {
    this.modal?.classList.toggle("active");
  }
}

export const setupModalSwitcher = (modal1, modal2) => {
  const btn1 = modal1.querySelector('button[name="switcher"]');
  const btn2 = modal2.querySelector('button[name="switcher"]');

  const switchModals = () => {
    modal1.classList.toggle("active");
    modal2.classList.toggle("active");
  };

  btn1?.addEventListener("click", switchModals);
  btn2?.addEventListener("click", switchModals);
};
