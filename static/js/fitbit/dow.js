"use strict";



function draw_barchart() {

  var margin = { top: 120, right: 20, bottom: 30, left: 50 },
      height = 250 - margin.top - margin.bottom;
  var width = 425 - margin.left - margin.right;

  var x = d3.scaleBand().rangeRound([0, width]).padding(0.1),
      y = d3.scaleLinear().rangeRound([height, 0]);

  var barchart = d3.select("#sleepdow")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");


  d3.tsv("/static/data/fitbit/marsland-fitbit-sleep-dow.tsv", function(d) {
    d.asleep_hours = +d.asleep_hours;
    return d;
  }, function(error, data) {
    if (error) throw error;

    x.domain(data.map(function(d) { return d.dow; }));
    y.domain([5, d3.max(data, function(d) { return d.asleep_hours; })]);

    barchart.append("g")
        .attr("class", "axis axis--x")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x))

    // Hide
    // barchart.append("g")
    //     .attr("class", "axis axis--y")
    //     .call(d3.axisLeft(y).ticks(5, "#"))
    //   .append("text")
    //     .attr("transform", "rotate(-90)")
    //     .attr("y", 6)
    //     .attr("dy", "0.71em")
    //     .attr("text-anchor", "end")
    //     .text("DDDD");

    barchart.selectAll(".bar")
      .data(data)
      .enter().append("rect")
        .attr("class", "bar")
        .attr("x", function(d) { return x(d.dow); })
        .attr("y", function(d) { return y(d.asleep_hours); })
        .attr("width", x.bandwidth())
        .attr("height", function(d) { return height - y(d.asleep_hours); });

    // Data Labels
    barchart.selectAll(".text")     
      .data(data)
      .enter()
      .append("text")
      .attr("class","label")
      .attr("x", (function(d) { return x(d.dow) + x.bandwidth()/2; }  ))
      .attr("y", function(d) { return y(d.asleep_hours); })
      .attr("dy", "-0.2em")
      .text(function(d) { return d.asleep_hours; });


  });


}