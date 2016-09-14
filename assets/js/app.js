$(document).ready(function() {
  app.init();
  app.authModule.init();
  app.mapModule.init();
  app.queryModule.init();
});

var app = {

  editor: null,
  currentFields: null,
  currentRows: null,
  currentGeometryColumn: null,

  init: function() {
    this.bindUIActions();
    this.buildEditor();
    app.authModule.checkLogin();
  },

  bindUIActions: function() {
    $("#about-btn").click(function() {
      $("#aboutModal").modal("show");
      $(".navbar-collapse.in").collapse("hide");
      return false;
    });

    $(window).resize(function() {
      $("#table").bootstrapTable("resetView", {
        height: $(window).height() - 70
      });
    });
  },

  buildEditor: function() {
    app.editor = CodeMirror.fromTextArea($("#query")[0], {
      mode: "text/x-sql",
      lineNumbers: true,
      lineWrapping: true,
      viewportMargin: Infinity
    });
  },

  authModule: {
    init: function() {
      this.bindUIActions();
    },

    bindUIActions: function() {
      $("#login-btn").click(function() {
        app.authModule.login();
        return false;
      });

      $("#logout-btn").click(function() {
        app.authModule.logout();
        return false;
      });
    },

    checkLogin: function() {
      if (!sessionStorage.getItem("fulcrum_query_token")) {
        $("#loginModal").modal("show");
        $(".modal-backdrop").css("opacity", "1");
      } else {
        $("#logout-btn").removeClass("hide");
        $("#loginModal").modal("hide");
        $(".modal-backdrop").css("opacity", "0.5");
        app.authModule.fetchAccounts();
      }
    },

    login: function() {
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
        success: function(data) {
          contexts = $(data.user.contexts).sort(function(a, b) {
            return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
          });
          sessionStorage.setItem("fulcrum_query_token", btoa(contexts[0].api_token));
          app.authModule.checkLogin();
        }
      });
    },

    logout: function() {
      sessionStorage.removeItem("fulcrum_query_token");
      location.reload();
    },

    fetchAccounts: function() {
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
          contexts = $(data.user.contexts).sort(function(a, b) {
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
          app.queryModule.fetchQueries();
          app.editor.getDoc().setValue("SELECT * FROM tables;");
          app.queryModule.executeQuery();
        }
      });
    }
  },

  mapModule: {
    init: function() {
      this.buildMap();
      this.addControls();
      this.bindUIActions();
    },

    bindUIActions: function() {
      $("#map-btn").click(function() {
        if (app.currentRows && app.currentGeometryColumn) {
          $("#mapModal").on("shown.bs.modal", function() {
            app.mapModule.map.invalidateSize();
            app.mapModule.mapData();
          });
          $("#mapModal").modal("show");
        } else {
          alert("Table must include geometry column!");
        }
        $(".navbar-collapse.in").collapse("hide");
        return false;
      });
    },

    mapLayer: MQ.mapLayer(),

    points: L.geoJson(null, {
      pointToLayer: function(feature, latlng) {
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
      onEachFeature: function(feature, layer) {
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
            maxWidth: $("#map").width() / 2
          });
        }
      }
    }),

    buildMap: function() {
      app.mapModule.map = L.map("map", {
        layers: [app.mapModule.mapLayer, app.mapModule.points]
      }).fitWorld();
    },

    addControls: function() {
      L.control.layers({
        "Streets": app.mapModule.mapLayer,
        "Hybrid": MQ.hybridLayer(),
        "Satellite": MQ.satelliteLayer(),
        "Dark": MQ.darkLayer(),
        "Light": MQ.lightLayer()
      }, null, {
        collapsed: false
      }).addTo(app.mapModule.map);
    },

    mapData: function() {
      var features = [];

      app.currentRows.forEach(function(row) {
        if (row[app.currentGeometryColumn]) {
          var properties = Object.assign({}, row);

          features.push({
            "type": "Feature",
            "properties": properties,
            "geometry": row[app.currentGeometryColumn]
          });
        }
      });

      var geojson = {
        "type": "FeatureCollection",
        "features": features
      };

      app.mapModule.points.clearLayers();
      app.mapModule.points.addData(geojson);
      app.mapModule.map.fitBounds(app.mapModule.points.getBounds());
    }
  },

  queryModule: {
    init: function() {
      this.bindUIActions();
    },

    bindUIActions: function() {
      $("#csv-upload-input").change(function(evt) {
        var file = evt.target.files[0];
        Papa.parse(file, {
          skipEmptyLines: true,
          header: true,
          dynamicTyping: true,
          complete: function(results) {
            localStorage.setItem("fulcrum_queries", JSON.stringify(results.data));
            app.queryModule.fetchQueries();
            app.editor.getDoc().setValue($("#saved-queries-select option:first-child").val());
            alert("Queries imported successfully!");
          }
        });
      });

      $("#sqlModal").on("shown.bs.modal", function(e) {
        app.editor.refresh();
      });

      $(".search > input").keyup(function() {
        $("#feature-count").html($("#table").bootstrapTable("getData").length + " records");
      });

      $("#saved-queries-select").change(function() {
        app.editor.getDoc().setValue($("#saved-queries-select").val());
      });

      $("#context-select").change(function() {
        sessionStorage.setItem("fulcrum_query_token", btoa(this.value));
        app.editor.getDoc().setValue("SELECT * FROM tables;");
        $("#saved-queries-select").val("SELECT * FROM tables;");
        app.queryModule.executeQuery();
        app.queryModule.fetchQueries();
      });

      $(".launch-query-btn").click(function() {
        $("#sqlModal").modal("show");
        return false;
      });

      $("#execute-query-btn").click(function() {
        app.queryModule.executeQuery();
        return false;
      });

      $("#save-query-btn").click(function() {
        if (app.editor.getDoc().getValue() !== "SELECT * FROM tables;") {
          app.queryModule.saveQuery();
        }
        return false;
      });

      $("#delete-query-btn").click(function() {
        if ($("#saved-queries-select option:selected").index() === 0) {
          alert("This query cannot be deleted!");
        } else {
          var ok = confirm("Are you sure you want to delete the following query: " + $("#saved-queries-select option:selected").text() + "?");
          if (ok === true) {
            app.queryModule.deleteQuery();
          }
          $("[data-toggle='dropdown']").parent().removeClass("open");
          return false;
        }
      });

      $("#export-queries-btn").click(function() {
        app.queryModule.exportQueries();
        $("[data-toggle='dropdown']").parent().removeClass("open");
        return false;
      });

      $("#import-queries-btn").click(function() {
        app.queryModule.importQueries();
        $("[data-toggle='dropdown']").parent().removeClass("open");
        return false;
      });

      $("#download-csv-btn").click(function() {
        var data = JSON.parse(JSON.stringify($("#table").bootstrapTable("getData")));
        for (var i = 0; i < data.length; i++) {
          for (var prop in data[i]) {
            if ($.type(data[i][prop]) === "object") {
              data[i][prop] = JSON.stringify(data[i][prop]);
            }
          }
        }
        var csv = Papa.unparse(data);
        var blob = new Blob([csv], {
          type: "text/csv"
        });
        saveAs(blob, "records.csv");
        $("[data-toggle='dropdown']").parent().removeClass("open");
        return false;
      });

      $("#download-json-btn").click(function() {
        var data = $("#table").bootstrapTable("getData");
        var json = JSON.stringify(data);
        var blob = new Blob([json], {
          type: "application/json"
        });
        saveAs(blob, "records.json");
        $("[data-toggle='dropdown']").parent().removeClass("open");
        return false;
      });
    },

    fetchQueries: function() {
      if (localStorage.getItem("fulcrum_queries")) {
        var queries = JSON.parse(localStorage.getItem("fulcrum_queries"));
        queries = queries.filter(function(query) {
          return query.organization == $("#context-select option:selected").text();
        });
        queries = queries.sort(function(a, b) {
          return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
        });
        $("#saved-queries-select").empty();
        $("#saved-queries-select").append($("<option></option>").attr("value", "SELECT * FROM tables;").text("All tables"));
        $.each(queries, function(index, value) {
          $("#saved-queries-select").append($("<option></option>").attr("value", value.query).attr("id", value.id).text(value.name));
        });
      }
    },

    executeQuery: function() {
      var query = app.editor.getDoc().getValue();
      if (query.length > 0) {
        $("#loading").show();
        var url = "https://api.fulcrumapp.com/api/v2/query/?format=json&token=" + atob(sessionStorage.getItem("fulcrum_query_token")) + "&q=" + encodeURIComponent(query);
        $.ajax({
          url: url,
          success: app.queryModule.parseQueryResponse,
          error: function(jqXHR, textStatus, error) {
            app.currentFields = null;
            app.currentRows = null;
            $("#loading").hide();
            $("#error-alert").show();
            $("#error-message").html(jqXHR.responseText);
            $("#sqlModal").modal("show");
          }
        });
      } else {
        alert("Query required!");
      }
    },

    saveQuery: function() {
      var name = prompt("Query name");
      if (name !== null) {
        var query = app.editor.getDoc().getValue();
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
        app.queryModule.fetchQueries();
        $("#saved-queries-select").val(query);
      } else {
        alert("Query name is required!");
      }
    },

    deleteQuery: function() {
      var queries = JSON.parse(localStorage.getItem("fulcrum_queries"));
      queries = queries.filter(function(query) {
        return query.id != $("#saved-queries-select option:selected").attr("id");
      });
      localStorage.setItem("fulcrum_queries", JSON.stringify(queries));
      app.queryModule.fetchQueries();
      $("#saved-queries-select").val($("#saved-queries-select option:first-child").val());
      app.editor.getDoc().setValue($("#saved-queries-select option:first-child").val());
    },

    exportQueries: function() {
      var queries = JSON.parse(localStorage.getItem("fulcrum_queries"));
      queries = queries.sort(function(a, b) {
        return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
      });
      var csv = Papa.unparse(queries);
      var blob = new Blob([csv], {
        type: "text/csv;charset=utf-8"
      });
      saveAs(blob, "queries.csv");
    },

    importQueries: function() {
      var ok = confirm("Imported queries will delete/overwrite any existing queries. Are you sure you want to proceed?");
      if (ok === true) {
        $("#csv-upload-input").trigger("click");
      }
    },

    urlFormatter: function(value, row, index) {
      if (value && value.length > 0) {
        return "<a href='" + value + "' target='_blank'>" + value + "</a>";
      } else {
        return "";
      }
    },

    geomFormatter: function(value, row, index) {
      if (value) {
        return JSON.stringify(value);
      } else {
        return "";
      }
    },

    parseQueryResponse: function(json) {
      var columns = [];

      app.currentFields = json.fields;
      app.currentRows = json.rows;
      app.currentGeometryColumn = null;

      json.fields.forEach(function(value, index) {
        if (value.type === "geometry" && app.currentGeometryColumn === null) {
          app.currentGeometryColumn = value.name;
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
                columns[j].formatter = app.queryModule.urlFormatter;
              }
            } else if (field.type == "geometry") {
              columns[j].formatter = app.queryModule.geomFormatter;
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
        onSearch: function(e) {
          $("#feature-count").html($("#table").bootstrapTable("getData").length + " records");
        }
      });
      $("#table").bootstrapTable("resetView", {
        height: $(window).height() - 70
      });
      $("#feature-count").html($("#table").bootstrapTable("getData").length + " records");
      $("#toolbar").show();
      $("#sqlModal").modal("hide");
      $("#error-alert").hide();
      $("#loading").hide();
    }
  }

};
