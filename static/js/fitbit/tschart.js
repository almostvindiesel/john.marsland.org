"use strict";

// line chart code: https://bl.ocks.org/d3noob/402dd382a51a4f6eea487f9a35566de0
// time series from: http://bl.ocks.org/mbostock/3883245
// set the dimensions and margins of the graph


function draw_tschart() {

    var browserWidth = window.innerWidth || document.body.clientWidth;
    var maxWidth = 1400;
    var minWidth = 900;
    var minGutter = 50

    var margin = { top: 120, right: 20, bottom: 30, left: 50 },
        height = 525 - margin.top - margin.bottom;
    var width = Math.max(Math.min(browserWidth, maxWidth),minWidth) - margin.left - margin.right - minGutter;


    // var parseTime = d3.timeParse("%d-%b-%y");
    var parseTime = d3.timeParse("%Y-%m-%d");

    var _x = d3.scaleTime().range([0, width]);
    var _y = d3.scaleLinear().range([height, 0]);

    var valueline = d3.line().x(function (d) {
      return _x(d.date);
    }).y(function (d) {
      return _y(d.asleep_hours);
    });

    var tschart = d3.select("#sleepovertime")
              .attr("width", width + margin.left + margin.right)
              .attr("height", height + margin.top + margin.bottom)
              .append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")")
              .attr("transform", "translate("+ margin.left +","+ margin.top +")");

    d3.tsv("/static/data/fitbit/marsland-fitbit-sleep.tsv", function (error, data) {

      if (error) throw error;

      data.forEach(function (d) {
        d.date = parseTime(d.date);
        d.asleep_hours = +d.asleep_hours;
      });

      _x.domain(d3.extent(data, function (d) {
        return d.date;
      }));
      _y.domain([4, d3.max(data, function (d) {
        return d.asleep_hours;
      })]);

      tschart.append("path").data([data]).attr("class", "line").attr("d", valueline);
      tschart.append("g").attr("class", "x-axis").attr("transform", "translate(0," + height + ")").call(d3.axisBottom(_x));
      tschart.append("g").call(d3.axisLeft(_y));

      //Add annotations
      var labels = [
      {
        data: { date: "2017-04-04", asleep_hours: 6.7 },
        dy: 85,
        dx: 0,
        note: { align: "middle", label: "Started New Job" },
        subject: { text: 'C', y: "bottom" },
        id: "minimize-badge",
        label: "test"
      },
      {
        data: { date: "2017-07-04", asleep_hours: 6.0 },
        dy: 85,
        dx: 0,
        note: { align: "middle", label: "New Job: 3 Months In" },
        subject: { text: 'C', y: "bottom" },
        id: "minimize-badge",
        label: "test"
      },
      {
        data: { date: "2017-10-04", asleep_hours: 5.6 },
        dy: 85,
        dx: 0,
        note: { align: "middle", label: "New Job: 6 Months In" },
        subject: { text: 'C', y: "bottom" },
        id: "minimize-badge",
        label: "test"
      },
      {
        data: { date: "2018-01-09", asleep_hours: 5.8 },
        dy: -85,
        dx: 0,
        note: { align: "middle", label: "Twins Born" },
        subject: { text: 'C', y: "bottom" },
        id: "minimize-badge",
        label: "test"
      },
      {
        data: { date: "2018-03-23", asleep_hours: 5.8 },
        dy: 85,
        dx: -85,
        note: { align: "right", label: "Luna Comes Home" },
        subject: { text: 'C', y: "bottom" },
        id: "minimize-badge",
        label: "test"
      }

      ].map(function (l) {
        l.note = Object.assign({}, l.note, { title: l.data.asleep_hours + " hours"
          });
        return l;
      });


      var timeFormat = d3.timeFormat("%d-%b-%y");

      window.makeAnnotations = d3.annotation().annotations(labels).type(d3.annotationCalloutElbow).accessors({ x: function x(d) {
          return _x(parseTime(d.date));
        },
        y: function y(d) {
          return _y(d.asleep_hours);
        }
      });


      tschart.append("g").attr("class", "annotation-test").call(makeAnnotations);
    });

}