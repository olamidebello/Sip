const featureLabels = {
  meetings: "Meetings",
  screen_share: "Screen sharing",
  remote_assist: "Pointer assistance",
  messaging: "Messaging",
  billing: "Plans and billing",
  call_center: "Call center agent"
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
    $("#group-edit-name").value=group?.name||"";
    checkboxList($("#group-edit-features"), group?.features || {}, "group-edit");
  }
  function fillUser() {
    const user = users.find((item) => item.id === $("#group-user").value);
    $("#group-user-details").textContent=user ? `${user.name} — ${user.role}, ${user.status}` : "Select a user";
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
    let events;
    [{ groups }, { users }, { events }] = await Promise.all([
      api("/api/admin/groups"), api("/api/admin/users"), api("/api/admin/security/events")
    ]);
    $("#security-events").replaceChildren(...events.map((event)=>{
      const row=document.createElement("li");
      row.textContent=`${event.created_at} · ${event.action} · actor ${event.actor_id} · target ${event.target_id||"none"}`;
      return row;
    }));
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
        { name:$("#group-edit-name").value,features:selectedFeatures($("#group-edit-features")) }, "PUT");
      await refresh();
      status("Group permissions updated");
    } catch (error) { status(error.message); }
  };
  $("#group-delete").onclick=async()=>{
    try {
      const id=$("#group-list").value;
      if (!id) return status("Select a group");
      await api(`/api/admin/groups/${id}/delete`,{},"POST");
      await refresh();status("Empty group deleted");
    } catch(error) {status(error.message);}
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
  for(const [button,action] of Object.entries({
    "#user-suspend":"suspend","#user-activate":"activate","#user-revoke":"revoke_sessions",
    "#user-promote":"promote","#user-demote":"demote"
  })) $(button).onclick=async()=>{
    try {
      const id=$("#group-user").value;
      if (!id) return status("Select a user");
      await api(`/api/admin/users/${id}/security`,{action});
      await refresh();status(`User action completed: ${action}`);
    } catch(error) {status(error.message);}
  };
  return { refresh };
}
