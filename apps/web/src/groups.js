const featureLabels = {
  meetings: "Meetings",
  screen_share: "Screen sharing",
  remote_assist: "Pointer assistance",
  messaging: "Messaging",
  billing: "Plans and billing"
};

export function setupGroupAdmin() {
  const root = document.querySelector("#group-admin");
  const $ = (selector) => root.querySelector(selector);
  let groups = [], users = [];
  const status = (message) => { $("#group-status").textContent = message; };
  async function api(path, body, method = "POST") {
    const response = await fetch(path, body === undefined ? {} : {
      method, headers: { "Content-Type":"application/json" }, body:JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  function checkboxList(container, values, prefix) {
    container.replaceChildren();
    for (const [key, label] of Object.entries(featureLabels)) {
      const row = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.value = key;
      check.id = prefix + "-" + key;
      check.checked = values[key] === true;
      row.append(check, document.createTextNode(" " + label));
      container.append(row);
    }
  }
  function selectedFeatures(container) {
    return Object.fromEntries(Object.keys(featureLabels).map((key) =>
      [key, !!container.querySelector(`input[value="${key}"]`)?.checked]));
  }
  function fillGroup() {
    const group = groups.find((item) => item.id === $("#group-list").value);
    checkboxList($("#group-edit-features"), group?.features || {}, "group-edit");
  }
  function fillUser() {
    const user = users.find((item) => item.id === $("#group-user").value);
    const container = $("#group-memberships");
    container.replaceChildren();
    for (const group of groups) {
      const row = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.value = group.id;
      check.checked = user?.group_ids.includes(group.id) || false;
      row.append(check, document.createTextNode(" " + group.name));
      container.append(row);
    }
  }
  async function refresh() {
    [{ groups }, { users }] = await Promise.all([
      api("/api/admin/groups"), api("/api/admin/users")
    ]);
    const chosenGroup = $("#group-list").value;
    const chosenUser = $("#group-user").value;
    $("#group-list").replaceChildren(...groups.map((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = `${group.name} (${group.members})`;
      return option;
    }));
    $("#group-user").replaceChildren(...users.map((user) => {
      const option = document.createElement("option");
      option.value = user.id;
      option.textContent = `${user.name} <${user.email}>`;
      return option;
    }));
    if (groups.some((group) => group.id === chosenGroup)) $("#group-list").value = chosenGroup;
    if (users.some((user) => user.id === chosenUser)) $("#group-user").value = chosenUser;
    fillGroup();
    fillUser();
    checkboxList($("#group-new-features"), {}, "group-new");
  }
  $("#group-list").onchange = fillGroup;
  $("#group-user").onchange = fillUser;
  $("#group-create").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/groups", {
        name:new FormData(event.currentTarget).get("name"),
        features:selectedFeatures($("#group-new-features"))
      });
      event.currentTarget.reset();
      await refresh();
      status("Group created");
    } catch (error) { status(error.message); }
  });
  $("#group-update").onclick = async () => {
    try {
      await api("/api/admin/groups/" + $("#group-list").value,
        { features:selectedFeatures($("#group-edit-features")) }, "PUT");
      await refresh();
      status("Group permissions updated");
    } catch (error) { status(error.message); }
  };
  $("#group-assign").onclick = async () => {
    try {
      const groupIds = [...$("#group-memberships").querySelectorAll("input:checked")]
        .map((input) => input.value);
      await api(`/api/admin/users/${$("#group-user").value}/groups`, { groupIds }, "PUT");
      await refresh();
      status("User group membership updated");
    } catch (error) { status(error.message); }
  };
  return { refresh };
}
