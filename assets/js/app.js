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
      function validateCredentials () {
        var $email = $("#email");
        var $password = $("#password");

        $email.val($email.val().trim());
        $password.val($password.val().trim());

        if (!($email.val().length && $password.val().length)) {
          alert('Please enter email and password');
        } else {
          app.authModule.login();
        }
        return false;
      }

      $("#login-btn").click(validateCredentials);

      $(".login-form").on('submit', validateCredentials);

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
        app.queryModule.fetchQueries();
        app.queryModule.initialQuery();
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
          $orgSelect = $("#context-select");
          contexts = $(data.user.contexts).sort(function(a, b) {
            return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
          });
          contexts.each(function (i, context) {
            $orgSelect.append($('<option></option>')
                              .attr("value", context.id)
                              .text(context.name));
          });
          $('.login-form :input').attr('disabled', 'disabled')
          $(".org-picker-form").show();
        }
      });
    },

    logout: function() {
      sessionStorage.removeItem("fulcrum_query_token");
      location.reload();
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

      $(".org-picker-form").submit(function () {
        var username = $("#email").val();
        var password = $("#password").val();

        var data = {
          authorization: {
            organization_id: $("#context-select").val(),
            note: "Fulcrum Query Utility",
            timeout: 60 * 60
          }
        };

        $.ajax({
          type: "POST",
          url: "https://api.fulcrumapp.com/api/v2/authorizations",
          contentType: "application/json",
          data: JSON.stringify(data),
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
            sessionStorage.setItem("fulcrum_query_token", btoa(data.authorization.token));
            app.editor.getDoc().setValue("SELECT * FROM tables;");
            $("#saved-queries-select").val("SELECT * FROM tables;");
            app.queryModule.executeQuery();
            app.queryModule.fetchQueries();
            $("#loginModal").modal("hide");
          }
        });
        return false;
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

      $("#delete-records-btn").click(function() {
        var count = $("#table").bootstrapTable("getSelections").length;
        if (count > 0) {
          var response = confirm("Are you absolutely sure you want to permanently delete " + count + (count == 1 ? " record" : " records") + " from the Fulcrum database?\nThis cannot be undone!");
          if (response === true) {
            app.queryModule.deleteRecords();
          }
        }
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
        $.ajax({
          type: "POST",
          url: "https://api.fulcrumapp.com/api/v2/query",
          data: JSON.stringify({
            "q": query,
            "format": "json"
          }),
          contentType: "application/json",
          headers: {
            "X-ApiToken": atob(sessionStorage.getItem("fulcrum_query_token"))
          },
          success: app.queryModule.parseQueryResponse,
          error: function(jqXHR, textStatus, error) {
            app.currentFields = null;
            app.currentRows = null;
            $("#loading").hide();
            $("#error-alert").show();
            $("#error-message").html(jqXHR.responseText);
            $("#sqlModal").modal("show");
          },
          statusCode: {
            401: function() {
              alert("Session authorization expired");
              app.authModule.logout();
            }
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

    initialQuery: function() {
      var urlParams = {};
      if (location.search) {
        var parts = location.search.substring(1).split("&");
        for (var i = 0; i < parts.length; i++) {
          var nv = parts[i].split("=");
          if (!nv[0]) continue;
          urlParams[nv[0]] = nv[1] || true;
        }
      }
      if (urlParams.q) {
        app.editor.getDoc().setValue(decodeURI(urlParams.q));
        $("#sqlModal").modal("show");
        app.queryModule.executeQuery();
      } else {
        app.editor.getDoc().setValue("SELECT * FROM tables;");
        app.queryModule.executeQuery();
      }
    },

    urlFormatter: function(value, row, index) {
      if (value && value.length > 0) {
        return "<a href='" + value + "' target='_blank'>" + value + "</a>";
      } else {
        return "";
      }
    },

    fulcrumFormatter: function(value, row, index) {
      if (value && value.length > 0) {
        return "<a href='https://web.fulcrumapp.com/records/" + value + "' target='_blank'>" + value + "</a>";
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
          value.formatter = app.queryModule.geomFormatter;
        }

        else if (value.type == "string") {
          for (var i = 0; i < json.rows.length; i++) {
            if (json.rows[i][value.name] && json.rows[i][value.name].indexOf("http") === 0) {
              value.formatter = app.queryModule.urlFormatter;
            }
          }
          if (value.name == "_record_id" || value.name == "fulcrum_id") {
            value.formatter = app.queryModule.fulcrumFormatter;
            columns.push({
              field: "state",
              checkbox: true
            });
          }
        }

        columns.push({
          field: value.name,
          title: value.name,
          align: "left",
          valign: "middle",
          sortable: true,
          formatter: value.formatter ? value.formatter : ""
        });
      });

      $("#table").bootstrapTable();
      $("#table").bootstrapTable("refreshOptions", {
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
        },
        onCheck: function(e) {
          $("#delete-records-btn").show();
          $("#delete-count").html($("#table").bootstrapTable("getSelections").length);
        },
        onCheckAll: function(e) {
          $("#delete-records-btn").show();
          $("#delete-count").html($("#table").bootstrapTable("getSelections").length);
        },
        onUncheck: function(e) {
          if ($("#table").bootstrapTable("getSelections").length === 0) {
            $("#delete-records-btn").hide();
          }
          $("#delete-count").html($("#table").bootstrapTable("getSelections").length);
        },
        onUncheckAll: function(e) {
          $("#delete-records-btn").hide();
        }
      });
      $("#table").bootstrapTable("resetView", {
        height: $(window).height() - 70
      });
      $("#feature-count").html($("#table").bootstrapTable("getData").length + " records");
      $("#toolbar").show();
      //$("#sqlModal").modal("hide");
      $("#error-alert").hide();
      $("#loading").hide();
    },

    deleteRecords: function() {
      var selections = $("#table").bootstrapTable("getSelections");
      var id = null, field = null;
      var deleted = 0;
      var notfound = [];
      var unauthorized = [];
      $.each(selections, function(index, value) {
        if (value._record_id) {
          field = "_record_id";
          id = value._record_id;
        } else if (value.fulcrum_id) {
          field = "fulcrum_id";
          id = value._record_id;
        }
        $.ajax({
          async: false,
          url: "https://api.fulcrumapp.com/api/v2/records/" + id + ".json",
          type: "DELETE",
          contentType: "application/json",
          dataType: "json",
          headers: {
            "X-ApiToken": atob(sessionStorage.getItem("fulcrum_query_token"))
          },
          statusCode: {
            401: function() {
              unauthorized.push(id);
            },
            404: function() {
              notfound.push(id);
            },
            204: function() {
              $("#table").bootstrapTable("remove", {
                field: field,
                values: [id]
              });
              $("#feature-count").html($("#table").bootstrapTable("getData").length + " records");
              $("#delete-records-btn").hide();
              deleted++;
            }
          }
        });
      });
      if (unauthorized.length > 0) {
        alert("You were unauthorized to delete the following records: " + unauthorized.join("\n"));
      }
      if (notfound.length > 0) {
        alert("The following records were not found in your account: " + notfound.join("\n"));
      }
      if (deleted > 0) {
        alert(deleted + (deleted == 1 ? " record" : " records") + " deleted!");
      }
    }
  }

};
