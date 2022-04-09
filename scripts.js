// JavaScript Document
$(document).scroll( function () {
    rgb = $(document).scrollTop(); // just divide this number by however slow you want the effect to take place.
    $(document).css("background","rgb(" + 255-rgb + ", " + 255-rgb + ", " + 255-rgb + ")");
} );