const form = document.querySelector("form");
const credential = document.querySelector("#deployment-credential");
const cancel = document.querySelector("#cancel");
const error = document.querySelector("#credential-error");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  error.textContent = "";
  const value = credential.value;
  credential.value = "";
  window.secureCredential.submit(value);
});

cancel.addEventListener("click", () => {
  credential.value = "";
  window.secureCredential.cancel();
});

window.secureCredential.onError((message) => {
  error.textContent = message;
  credential.focus();
});

credential.focus();
