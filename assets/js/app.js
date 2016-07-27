$(document).ready(function() {
  checkLogin();
  editor = CodeMirror.fromTextArea($("#query")[0], {
    mode: "text/x-sql",
    lineNumbers: true,
    lineWrapping: true,
    viewportMargin: Infinity
  });
});

var editor;
var currentFields = null;
var currentRows = null;
var currentGeometryColumn = null;

var mapLayer = MQ.mapLayer();

var points = L.geoJson(null, {
  pointToLayer: function (feature, latlng) {
    return L.marker(latlng, {
      icon: L.icon({
        iconUrl: "assets/img/map-marker.png",
        iconSize: [30, 40],
        iconAnchor: [15, 32],
        popupAnchor: [0, -29]
      }),
      title: feature.properties._title ? feature.properties._title : "",
      riseOnHover: true
    });
  },
  onEachFeature: function (feature, layer) {
    if (feature.properties) {
      var attributes = [];
      $.each(feature.properties, function(index, property) {
        if (!property) {
          property = "";
        }
        if (typeof property == "string" && (property.indexOf("http") === 0 || property.indexOf("https") === 0)) {
          property = "<a href='" + property + "' target='_blank'>" + property + "</a>";
        }
        attributes.push("<strong>" + index + "</strong>: " + property);
      });
      layer.bindPopup(attributes.join("<br>"), {
        maxHeight: 200,
        maxWidth: $("#map").width() - 125
      });
    }
  }
});

var map = L.map("map", {
  layers: [mapLayer, points]
}).fitWorld();

var baseLayers ={
  "Map": mapLayer,
  "Hybrid": MQ.hybridLayer(),
  "Satellite": MQ.satelliteLayer(),
  "Dark": MQ.darkLayer(),
  "Light": MQ.lightLayer()
};

var layerControl = L.control.layers(baseLayers, null, {
  collapsed: true
}).addTo(map);

function checkLogin() {
  if (!sessionStorage.getItem("fulcrum_query_token")) {
    $("#loginModal").modal("show");
    $(".modal-backdrop").css("opacity", "1");
  } else {
    $("#logout-btn").removeClass("hide");
    $("#loginModal").modal("hide");
    $(".modal-backdrop").css("opacity", "0.5");
    fetchAccounts();
  }
}

function login() {
  var username = $("#email").val();
  var password = $("#password").val();
  $.ajax({
    type: "GET",
    url: "https://api.fulcrumapp.com/api/v2/users.json",
    contentType: "application/json",
    dataType: "json",
    headers: {
      "Authorization": "Basic " + btoa(username + ":" + password)
    },
    statusCode: {
      401: function() {
        alert("Incorrect credentials, please try again.");
      }
    },
    success: function (data) {
      contexts = $(data.user.contexts).sort(function(a,b) {
        return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
      });
      sessionStorage.setItem("fulcrum_query_token", btoa(contexts[0].api_token));
      checkLogin();
    }
  });
}

function logout() {
  sessionStorage.removeItem("fulcrum_query_token");
  location.reload();
}

function fetchAccounts() {
  $("#loading").show();
  $.ajax({
    url: "https://api.fulcrumapp.com/api/v2/users.json",
    type: "GET",
    contentType: "application/json",
    dataType: "json",
    headers: {
      "X-ApiToken": atob(sessionStorage.getItem("fulcrum_query_token"))
    },
    success: function(data) {
      var options = "";
      contexts = $(data.user.contexts).sort(function(a,b) {
        return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
      });
      $.each(contexts, function(index, context) {
        options += "<option value='" + context.api_token + "'>" + context.name + "</option>";
      });
      $("#context-select").html(options);
    },
    complete: function() {
      $("#context-select").val(atob(sessionStorage.getItem("fulcrum_query_token")));
      $("#loading").hide();
      fetchQueries();
      editor.getDoc().setValue("SELECT * FROM tables;");
      executeQuery();
    }
  });
}

function fetchQueries() {
  if (localStorage.getItem("fulcrum_queries")) {
    var queries = JSON.parse(localStorage.getItem("fulcrum_queries"));
    queries = queries.filter(function(query) {
      return query.organization == $("#context-select option:selected").text();
    });
    queries = queries.sort(function(a,b) {
      return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
    });
    $("#saved-queries-select").empty();
    $("#saved-queries-select").append($("<option></option>").attr("value", "SELECT * FROM tables;").text("All tables"));
    $.each(queries, function(index, value) {
      $("#saved-queries-select").append($("<option></option>").attr("value", value.query).attr("id", value.id).text(value.name));
    });
  }
}

function executeQuery() {
  var query = editor.getDoc().getValue();
  if (query.length > 0) {
    $("#loading").show();
    var url = "https://api.fulcrumapp.com/api/v2/query/?format=json&token=" + atob(sessionStorage.getItem("fulcrum_query_token")) + "&q=" + encodeURIComponent(query);
    $.ajax({
      url: url,
      success: parseQueryResponse,
      error: function (jqXHR, textStatus, error) {
        currentFields = null;
        currentRows = null;
        $("#loading").hide();
        $("#error-alert").show();
        $("#error-message").html(jqXHR.responseText);
        $("#sqlModal").modal("show");
      }
    });
  } else {
    alert("Query required!");
  }
}

function saveQuery() {
  var name = prompt("Query name");
  if (name !== null) {
    var query = editor.getDoc().getValue();
    var queries;
    if (localStorage.getItem("fulcrum_queries")) {
      queries = JSON.parse(localStorage.getItem("fulcrum_queries"));
    } else {
      queries = [];
    }
    queries.push({
      "id": Date.now(),
      "organization": $("#context-select option:selected").text(),
      "name": name,
      "query": query
    });
    localStorage.setItem("fulcrum_queries", JSON.stringify(queries));
    fetchQueries();
    $("#saved-queries-select").val(query);
  } else {
    alert("Query name is required!");
  }
}

function deleteQuery() {
  var queries = JSON.parse(localStorage.getItem("fulcrum_queries"));
  queries = queries.filter(function(query) {
    return query.id != $("#saved-queries-select option:selected").attr("id");
  });
  localStorage.setItem("fulcrum_queries", JSON.stringify(queries));
  fetchQueries();
  $("#saved-queries-select").val($("#saved-queries-select option:first-child").val());
  editor.getDoc().setValue($("#saved-queries-select option:first-child").val());
}

function exportQueries() {
  var queries = JSON.parse(localStorage.getItem("fulcrum_queries"));
  queries = queries.sort(function(a,b) {
    return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
  });
  var csv = Papa.unparse(queries);
  var blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
  saveAs(blob, "queries.csv");
}

function importQueries() {
  var ok = confirm("Imported queries will delete/overwrite any existing queries. Are you sure you want to proceed?");
  if (ok === true) {
    $("#csv-upload-input").trigger("click");
  }
}

function parseQueryResponse(json) {
  var columns = [];

  currentFields = json.fields;
  currentRows = json.rows;
  currentGeometryColumn = null;

  json.fields.forEach(function(value, index) {
    if (value.type === "geometry" && currentGeometryColumn === null) {
      currentGeometryColumn = value.name;
    }

    columns.push({
      field: value.name,
      title: value.name,
      align: "left",
      valign: "middle",
      sortable: true
    });
  });

  for (var i = 0; i < 10; i++) {
    if (json.rows[i]) {
      for (var j = 0; j < json.fields.length; ++j) {
        var field = json.fields[j];

        if (field.type === "string") {
          if (json.rows[i][field.name] && json.rows[i][field.name].indexOf("http") === 0) {
            columns[j].formatter = urlFormatter;
          }
        }
      }
    }
  }

  $("#table").bootstrapTable("destroy");
  $("#table").bootstrapTable({
    data: json.rows,
    columns: columns,
    undefinedText: "",
    cache: false,
    height: "fit",
    toolbar: "#toolbar",
    showColumns: true,
    showToggle: true,
    search: true,
    trimOnSearch: false,
    striped: false,
    onSearch: function (e) {
      $("#feature-count").html($("#table").bootstrapTable("getData").length + " records");
    }
  });
  $("#table").bootstrapTable("resetView", {
    height: $(window).height()-70
  });
  $("#feature-count").html($("#table").bootstrapTable("getData").length + " records");
  $("#toolbar").show();
  $("#sqlModal").modal("hide");
  $("#error-alert").hide();
  $("#loading").hide();
}

function mapData() {
  var features = [];

  currentRows.forEach(function(row) {
    if (row[currentGeometryColumn]) {
      var properties = Object.assign({}, row);

      features.push({
        "type": "Feature",
        "properties": properties,
        "geometry": row[currentGeometryColumn]
      });
    }
  });

  var geojson = {
    "type": "FeatureCollection",
    "features": features
  };

  points.clearLayers();
  points.addData(geojson);
  map.fitBounds(points.getBounds());
}

function urlFormatter(value, row, index) {
  if (value && value.length > 0) {
    return "<a href='"+value+"' target='_blank'>"+value+"</a>";
  }
  else {
    return "";
  }
}

$("#csv-upload-input").change(function(evt) {
  var file = evt.target.files[0];
  Papa.parse(file, {
    skipEmptyLines: true,
    header: true,
    dynamicTyping: true,
		complete: function(results) {
      localStorage.setItem("fulcrum_queries", JSON.stringify(results.data));
      fetchQueries();
      editor.getDoc().setValue($("#saved-queries-select option:first-child").val());
      alert("Queries imported successfully!");
		}
	});
});

$("#sqlModal").on("shown.bs.modal", function(e) {
  editor.refresh();
});

$(".search > input").keyup(function() {
  $("#feature-count").html($("#table").bootstrapTable("getData").length + " records");
});

$("#saved-queries-select").change(function() {
  editor.getDoc().setValue($("#saved-queries-select").val());
});

$("#context-select").change(function() {
  sessionStorage.setItem("fulcrum_query_token", btoa(this.value));
  editor.getDoc().setValue("SELECT * FROM tables;");
  $("#saved-queries-select").val("SELECT * FROM tables;");
  executeQuery();
  fetchQueries();
});

$("#about-btn").click(function() {
  $("#aboutModal").modal("show");
  $(".navbar-collapse.in").collapse("hide");
  return false;
});

$("#map-btn").click(function() {
  if (currentRows && currentGeometryColumn) {
    $("#mapModal").on("shown.bs.modal", function() {
      map.invalidateSize();
      mapData();
    });
    $("#mapModal").modal("show");
  } else {
    alert("Table must include geometry column!");
  }
  $(".navbar-collapse.in").collapse("hide");
  return false;
});

$("#login-btn").click(function() {
  login();
  return false;
});

$("#logout-btn").click(function() {
  logout();
  return false;
});

$(".launch-query-btn").click(function() {
  $("#sqlModal").modal("show");
  return false;
});

$("#execute-query-btn").click(function() {
  executeQuery();
  return false;
});

$("#save-query-btn").click(function() {
  if (editor.getDoc().getValue() !== "SELECT * FROM tables;") {
    saveQuery();
  }
  return false;
});

$("#delete-query-btn").click(function() {
  if ($("#saved-queries-select option:selected").index() === 0) {
    alert("This query cannot be deleted!");
  } else {
    var ok = confirm("Are you sure you want to delete the following query: " + $("#saved-queries-select option:selected").text() + "?");
    if (ok === true) {
      deleteQuery();
    }
    $("[data-toggle='dropdown']").parent().removeClass("open");
    return false;
  }
});

$("#export-queries-btn").click(function() {
  exportQueries();
  $("[data-toggle='dropdown']").parent().removeClass("open");
  return false;
});

$("#import-queries-btn").click(function() {
  importQueries();
  $("[data-toggle='dropdown']").parent().removeClass("open");
  return false;
});

$("#download-csv-btn").click(function() {
  var data = $("#table").bootstrapTable("getData");
  var csv = Papa.unparse(data);
  var blob = new Blob([csv], {type: "text/csv"});
  saveAs(blob, "records.csv");
  $("[data-toggle='dropdown']").parent().removeClass("open");
  return false;
});

$("#download-json-btn").click(function() {
  var data = $("#table").bootstrapTable("getData");
  var json = JSON.stringify(data);
  var blob = new Blob([json], {type: "application/json"});
  saveAs(blob, "records.json");
  $("[data-toggle='dropdown']").parent().removeClass("open");
  return false;
});

$(window).resize(function () {
  $("#table").bootstrapTable("resetView", {
    height: $(window).height()-70
  });
});
