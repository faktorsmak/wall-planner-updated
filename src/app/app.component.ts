import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { ElementRef, ViewChild, HostListener } from '@angular/core';
import { Surface, Path, Text, Group, geometry } from '@progress/kendo-drawing';
import { FormsModule } from '@angular/forms';
const { Point, transform } = geometry;

@Component({
  selector: 'app-root',
  imports: [FormsModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})

export class AppComponent {
  title = "wall-planner";
  @ViewChild('surface', { static: true })
  private surfaceElement: ElementRef;
  private surface: Surface;

  private innerWidth = window.innerWidth;
  private innerHeight = window.innerHeight;

  trimTotals: any = {};
  scale: number = 6.1;
  picSizeMultiplier = 0.37;
  interval: number = 3; // 3" margin around all wall frames
  dimensionQueue: any = [];

  // these need to get reset on each redraw
  private xDimensionPos;
  private yDimensionPos;

  config = {
    showDimensions: false,

    wallWidth: 144, // 12'
    wallHeight: 108, // 9'
    baseboardThickness: 5.5,

    useChairRail: true,
    chairRailThickness: 3.5,
    chairRailHeight: 32,
    useSubRail: true,
    subRailSpacing: 2,
    subRailThickness: 1.25,

    useCrown: true,
    crownThickness: 3.5,

    useWallFrames: true,
    useUpperWallFrames: false,
    numberOfFrames: 4,

    usePictures: false,
    numberOfPictures: 1,
    picFrameWidth: 3,

    windows: [ // windows and doors
      // stores either windows or doors
      // {
      //   isDoor: boolean,
      //   distanceFromLeft: number,
      //   distanceFromFloor: number,
      //   width: number,
      //   height: number,
      //   frameWidth: number,
      //   useGrids: boolean
      // }
    ],

    expandWall: false,
    expandWF: false,
    expandCR: false,
    expandCM: false,
    maxTrimLength: 8
  }


  private getNewPath(highlight: boolean): Path {
    let color = '#c3c3c3';
    if (highlight) {
      color = '#0033aa';
    } else if (this.config.showDimensions) {
      color = '#d1d1d1';
    }
    return new Path({
      stroke: {
        color: color,
        width: 2
      }
    });
  }

  private reset(): void {
    this.xDimensionPos = this.config.wallWidth;
    this.yDimensionPos = this.config.wallHeight;
    this.trimTotals = {
      chairRail: 0,
      chairRailString: '',
      baseCap: 0,
      baseCapString: '',
      baseboard: 0,
      baseboardString: ''
    }
    this.dimensionQueue = [];
  }

  public addWindow(isDoor: boolean): void {
    let windowDefault = {
      isDoor,
      distanceFromLeft: 24,
      distanceFromFloor: isDoor ? 0 : 18,
      width: isDoor ? 39 : 36,
      height: isDoor ? 87.5 : 60,
      frameWidth: 3.5,
      useGrids: !isDoor
    };
    if (this.config.windows.length) {
      let lastWindow = this.config.windows[this.config.windows.length - 1];
      windowDefault.distanceFromLeft += lastWindow.distanceFromLeft + lastWindow.width;
    }
    this.config.windows.push(windowDefault);
    this.redraw();
  }

  public removeWindow(index: number): void {
    this.config.windows.splice(index, 1);
    this.redraw();
  }

  private stringifyTrimCounts(): void {
    let feet, inches;
    if (this.trimTotals.chairRail) {
      this.trimTotals.chairRailString = this.getTrimTotalBoards(this.trimTotals.chairRail);
    }
    if (this.trimTotals.baseboard) {
      this.trimTotals.baseboardString = this.getTrimTotalBoards(this.trimTotals.baseboard);
    }
    if (this.trimTotals.baseCap) {
      this.trimTotals.baseCapString = this.getTrimTotalBoards(this.trimTotals.baseCap);
    }
  }

  private getTrimTotalBoards(totalInches) {
    let feet = Math.floor(totalInches/12);
    let inches = totalInches % 12;
    if (inches % 1) {
      inches = Math.ceil(inches);
    }
    let totalString = (feet ? (feet + '\' ') : '') + (inches ? (inches + '"') : '');
    totalString += ' - (';
    let wroteFirst = false;
    if (Math.floor(feet / this.config.maxTrimLength)) {
      totalString += Math.floor(feet / this.config.maxTrimLength) + ' @ ' + this.config.maxTrimLength + '\'';
      wroteFirst = true;
    }
    if (((totalInches/12) % this.config.maxTrimLength) > 0) {
      if (wroteFirst) {
        totalString += ', ';
      }
      totalString += '1  @ ' + (((feet+1) % this.config.maxTrimLength) || this.config.maxTrimLength) + '\'';
    }
    totalString += ')';
    return totalString;
  }

  public orderWindows(): void {
    // make sure they are in order of distance from left edge
    this.config.windows.sort(function(a,b) {
      return a.distanceFromLeft - b.distanceFromLeft;
    });
  }

  public redraw(): void {
    this.surface.clear();
    this.reset();

    window.localStorage.setItem("wpconfig", JSON.stringify(this.config));

    this.orderWindows();

    // set the scale based on wall Width
    if (this.config.wallHeight >= this.config.wallWidth) {
      this.scale = (0.8 * this.innerHeight) / this.config.wallHeight;
    } else {
      this.scale = (0.6 * this.innerWidth) / this.config.wallWidth;
    }

    this.drawWall();
    this.drawBaseboard();

    if (this.config.useCrown) {
      this.drawCrownMolding();
    }

    if (this.config.windows.length) {
      this.drawWindows();
    }

    if (this.config.useChairRail) {
      this.drawChairRail();
    }

    if (this.config.useWallFrames) {
      this.drawWallFrames(false);
    }

    if (this.config.useUpperWallFrames) {
      this.drawWallFrames(true);
    }

    if (this.config.usePictures) {
      this.drawPictures();
    }
    
    if (this.config.showDimensions) {
      this.drawQueuedDimensions();
    }

    this.stringifyTrimCounts();
  }

  private drawQueuedDimensions(): void {
    for (let i=0; i < this.dimensionQueue.length; i++) {
      let d = this.dimensionQueue[i];
      d.direction === 'vertical' ? this.drawVerticalDimension(d.x, d.y1, d.y2) : this.drawHorizontalDimension(d.y, d.x1, d.x2);
    }
  }


  private drawBox(x1, y1, x2, y2, drawDimensions, highlight): void {
    const p = this.getNewPath(highlight);
    p.moveTo(x1 * this.scale, y1 * this.scale)
      .lineTo(x2 * this.scale, y1 * this.scale)
      .lineTo(x2 * this.scale, y2 * this.scale)
      .lineTo(x1 * this.scale, y2 * this.scale)
      .close();

    this.drawThing(p);

    if (drawDimensions) {
      if (y2 === this.config.wallHeight && (x2-x1) === this.config.wallWidth) {
        this.drawDimension(x1, y2, x2, y2);
        this.drawDimension(x2, y1, x2, y2);
      } else {
        this.drawDimension(x1, y1, x2, y2);
      }
    }
  }

  private drawLine(x1, y1, x2, y2): void {
    const p = this.getNewPath(false);
    p.moveTo(x1 * this.scale, y1 * this.scale)
      .lineTo(x2 * this.scale, y2 * this.scale);

    this.drawThing(p);
  }


  private drawWall(): void {
    // draw the room
    this.drawBox(0, 0, this.config.wallWidth, this.config.wallHeight, true, false);
  }

  private drawCrownMolding(): void {
    // draw crown molding
      this.drawCrownMoldingSection(0, this.config.wallWidth);
  }

  private drawCrownMoldingSection(x1, x2): void {
    let y1 = this.config.crownThickness;
    let y2 = 0;

    console.log("drawing crown box: ", x1, y1, x2, y2);
    this.drawBox(x1, y1, x2, y2, false, false);
    this.trimTotals.crown += x2-x1;
  }

  private drawBaseboard(): void {
    // draw the chair rail sections
    let doors = [];

    for (let i = 0; i < this.config.windows.length; i++) {
      if (this.config.windows[i].isDoor) {
        doors.push(this.config.windows[i]);
      }
    }
    if (doors.length) {
      // don't draw the chair rail over a window
      for (let i = 0; i < doors.length; i++) {
        let currentDoor = doors[i];
        this.drawBaseboardSection(i ? (doors[i - 1].distanceFromLeft + doors[i - 1].width) : 0, currentDoor.distanceFromLeft);
        if (i === doors.length - 1) {
          // last door, draw from the right edge to the end of the wall
          this.drawBaseboardSection(currentDoor.distanceFromLeft + currentDoor.width, this.config.wallWidth);
        }
      }
    } else {
      this.drawBaseboardSection(0, this.config.wallWidth);
    }

  }

  private drawBaseboardSection(x1, x2): void {
    let y1 = (this.config.wallHeight - this.config.baseboardThickness);
    let y2 = (this.config.wallHeight);

    this.drawBox(x1, y1, x2, y2, false, false);
    this.trimTotals.baseboard += x2-x1;
  }

  private drawWindows(): void {
    for (let i = 0; i < this.config.windows.length; i++) {
      let currentWindow = this.config.windows[i];

      let x1 = currentWindow.distanceFromLeft;
      let y1 = this.config.wallHeight - currentWindow.distanceFromFloor - currentWindow.height;
      let x2 = currentWindow.distanceFromLeft + currentWindow.width;
      let y2 = this.config.wallHeight - currentWindow.distanceFromFloor;
      this.drawBox(x1, y1, x2, y2, true, currentWindow.expand);

      // draw distance from the left wall
      this.queueHorizontalDimension((y1 + 10) - ((i + 1) * 2), 0, x1);

      x1 = currentWindow.distanceFromLeft + currentWindow.frameWidth;
      y1 = this.config.wallHeight - currentWindow.distanceFromFloor - currentWindow.height + currentWindow.frameWidth;
      x2 = currentWindow.distanceFromLeft + currentWindow.width - currentWindow.frameWidth;
      if (currentWindow.isDoor) {
        y2 = this.config.wallHeight;
      } else {
        y2 = this.config.wallHeight - currentWindow.distanceFromFloor - currentWindow.frameWidth;
      }
      this.drawBox(x1, y1, x2, y2, false, false);

      // draw grids if selected
      if (currentWindow.useGrids) {
        let windowWidth = x2 - x1;
        let numberOfVerticals = Math.floor(windowWidth / 12);
        let vGridSpacing = windowWidth/(numberOfVerticals + 1);
        for (let j=1; j <= numberOfVerticals; j++) {
          this.drawLine(x1 + (vGridSpacing * j), y1, x1 + (vGridSpacing * j), y2);
        }

        let windowHeight = y2 - y1;
        let numberOfHorizontals = Math.floor(windowHeight / 16);
        let hGridSpacing = windowHeight / (numberOfHorizontals + 1);
        for (let j = 1; j <= numberOfHorizontals; j++) {
          this.drawLine(x1, y1 + (hGridSpacing * j), x2, y1 + (hGridSpacing * j));
        }
      }
    }
  }


  private drawChairRail(): void {
    // draw the chair rail sections
    if (this.config.windows.length) {
      // don't draw the chair rail over a window
      let leftX = 0;
      for (let i = 0; i < this.config.windows.length; i++) {
        let currentWindow = this.config.windows[i];
        if (currentWindow.distanceFromFloor < this.config.chairRailHeight) {
          // don't draw the chair rail where the window is
          this.drawChairRailSection(leftX, currentWindow.distanceFromLeft);
          leftX = currentWindow.distanceFromLeft + currentWindow.width;
          if (i === this.config.windows.length - 1) {
            // last window, draw from the right edge to the end of the wall
            this.drawChairRailSection(leftX, this.config.wallWidth);
          }
        } else {
          if (i === this.config.windows.length - 1) {
            // last window, draw from the right edge to the end of the wall
            this.drawChairRailSection(leftX, this.config.wallWidth);
          }
        }
      }
    } else {
      this.drawChairRailSection(0, this.config.wallWidth);
    }

    this.drawDimension(0, this.config.wallHeight - this.config.chairRailHeight, 0, this.config.wallHeight);

    if (this.config.useSubRail) {
      this.drawSubRail();
    }

  }

  private drawChairRailSection(x1, x2): void {
    let y1 = (this.config.wallHeight - this.config.chairRailHeight);
    let y2 = (this.config.wallHeight - this.config.chairRailHeight + this.config.chairRailThickness);
    
    this.drawLine(x1, y1, x2, y1);
    this.drawLine(x1, y2, x2, y2);
    // this.drawBox(x1, y1, x2, y2, false);
    if (x2 - x1 !== this.config.wallWidth) {
      this.queueHorizontalDimension(y1 - 5, x1, x2);
    }
    this.trimTotals.chairRail += x2-x1;
  }

  private drawSubRail(): void {
    if (this.config.windows.length) {
      // don't draw the sub rail over a window
      for (let i = 0; i < this.config.windows.length; i++) {
        let currentWindow = this.config.windows[i];
        if ((currentWindow.distanceFromFloor < this.config.chairRailHeight - this.config.chairRailThickness - this.config.subRailSpacing)) {
          this.drawSubRailSection(i ? (this.config.windows[i - 1].distanceFromLeft + this.config.windows[i - 1].width) : 0, currentWindow.distanceFromLeft);
        } else {
          this.drawSubRailSection(i ? (this.config.windows[i - 1].distanceFromLeft + this.config.windows[i - 1].width) : 0, currentWindow.distanceFromLeft + currentWindow.width);

        }
        if (i === this.config.windows.length - 1) {
          // last window, draw from the right edge to the end of the wall
          this.drawSubRailSection(currentWindow.distanceFromLeft + currentWindow.width, this.config.wallWidth);
        }
      }
    } else {
      this.drawSubRailSection(0, this.config.wallWidth);
    }

    this.drawDimension(0, this.config.wallHeight - this.config.chairRailHeight, 0, this.config.wallHeight - this.config.chairRailHeight + this.config.chairRailThickness + this.config.subRailSpacing + this.config.subRailThickness);
  }

  private drawSubRailSection(x1, x2): void {
    let y1 = (this.config.wallHeight - this.config.chairRailHeight + this.config.chairRailThickness + this.config.subRailSpacing);
    let y2 = (this.config.wallHeight - this.config.chairRailHeight + this.config.chairRailThickness + this.config.subRailSpacing + this.config.subRailThickness);

    this.drawLine(x1, y1, x2, y1);
    this.drawLine(x1, y2, x2, y2);
    this.trimTotals.baseCap += x2-x1;
  }

  private drawWallFrames(isUpperFrames): void {
    // divide the wall into sections if the windows interfere
    // first check to see if any windows interfere and make a list of just those
    let interferingWindows = [];
    for (let i=0; i < this.config.windows.length; i++) {
      let currentWindow = this.config.windows[i];
      if ((currentWindow.distanceFromFloor < this.config.chairRailHeight - this.config.chairRailThickness - this.config.subRailSpacing)) {
        interferingWindows.push(currentWindow);
      }
    }
    if (interferingWindows.length) {
      let frameWidth = ((this.config.wallWidth - (this.interval * (this.config.numberOfFrames + 1))) / this.config.numberOfFrames);
      console.log("frame width: ", frameWidth);
      // draw the frame under the window if possible
      let frameCount;
      for (let i = 0; i < interferingWindows.length; i++) {
        let currentWindow = interferingWindows[i];
        // draw modified frame
        let x1 = i ? (interferingWindows[i - 1].distanceFromLeft + interferingWindows[i - 1].width) : 0;
        let x2 = currentWindow.distanceFromLeft;
        frameCount = Math.round((x2 - x1) / (frameWidth + this.interval)) || 1;

        // draw frame(s) before the window/door
        this.drawWallFrameSection(x1, x2, frameCount, null, false);
        if (isUpperFrames) {
          this.drawWallFrameSection(x1, x2, frameCount, null, true);
        }

        // draw frame(s) under the window
        if (!currentWindow.isDoor) {
          frameCount = Math.round(currentWindow.width / frameWidth) || 1;
          this.drawWallFrameSection(x2 - this.interval, x2 + currentWindow.width + this.interval, frameCount, currentWindow, false);
          if (isUpperFrames) {
            this.drawWallFrameSection(x2 - this.interval, x2 + currentWindow.width + this.interval, frameCount, currentWindow, true);
          }
        }
        if (i === interferingWindows.length - 1) {
          // last window, draw from the right edge to the end of the wall
          frameCount = Math.round((this.config.wallWidth - currentWindow.distanceFromLeft - currentWindow.width) / (frameWidth + this.interval)) || 1;
          this.drawWallFrameSection(currentWindow.distanceFromLeft + currentWindow.width, this.config.wallWidth, frameCount, null, false);
          if (isUpperFrames) {
            this.drawWallFrameSection(currentWindow.distanceFromLeft + currentWindow.width, this.config.wallWidth, frameCount, null, true);
          }
        }
      }
    } else {
      this.drawWallFrameSection(0, this.config.wallWidth, this.config.numberOfFrames, null, false);
      if (isUpperFrames) {
        this.drawWallFrameSection(0, this.config.wallWidth, this.config.numberOfFrames, null, true);
      }
    }
  }

  private drawWallFrameSection(x1, x2, frameCount, window, isUpper): void {
    let sectionWidth = x2 - x1;

    if (sectionWidth < (3 * this.config.subRailThickness) + (2 *this.interval)) {
      // if it's a tiny section, don't put a frame
      return;
    }

    let outsideY1; 
    if (isUpper) {
      outsideY1 = this.interval + (this.config.useCrown ? this.config.crownThickness : 0);
    } else {
      outsideY1 = (this.config.wallHeight - this.config.chairRailHeight + this.config.chairRailThickness + this.interval);  
      if (this.config.useSubRail) {
        outsideY1 += this.config.subRailSpacing + this.config.subRailThickness;
      }
    }

    // change Y if it is below a window
    if (window && (window.distanceFromFloor < this.config.chairRailHeight)) {
      outsideY1 = this.config.wallHeight - window.distanceFromFloor + this.interval;
      if (this.config.useSubRail && window.distanceFromFloor > this.config.chairRailHeight - this.config.chairRailThickness - this.config.subRailSpacing) {
        // if the window is higher than the subRail, move it below the subrail
        outsideY1 += this.config.subRailSpacing + this.config.subRailThickness;
      }
    }

    let insideY1 = outsideY1 + this.config.subRailThickness; // subrail is the same thickness as the frames

    let outsideY2;
    if (isUpper) {
      outsideY2 = this.config.wallHeight - this.config.chairRailHeight - this.interval;
    } else {
      outsideY2 = this.config.wallHeight - this.config.baseboardThickness - this.interval;
    }

    if (window && (outsideY2 - outsideY1) < (3 * this.config.subRailThickness)) {
      // if we're below a window and it's too short to put a frame, then don't
      return;
    }

    let insideY2 = outsideY2 - this.config.subRailThickness;

    let frameWidth = ((sectionWidth - (this.interval * (frameCount + 1)))/frameCount);

    let xOffset = x1;
    for (let i=0; i < frameCount; i++) {
      xOffset = x1 + ((this.interval + frameWidth) * i);

      let outsideX1 = (xOffset + this.interval);
      let outsideX2 = outsideX1 + frameWidth;

      let insideX1 = outsideX1 + this.config.subRailThickness;
      let insideX2 = outsideX2 - this.config.subRailThickness;

      this.drawBox(outsideX1, outsideY1, outsideX2, outsideY2, i === 0, false);
      this.drawBox(insideX1, insideY1, insideX2, insideY2, false, false);

      this.trimTotals.baseCap += (this.interval + frameWidth) * 2; // top and bottom with padding
      this.trimTotals.baseCap += (this.interval + (outsideY2 - outsideY1)) * 2; // top and bottom with padding
    }
  }

  private drawPictures(): void {
    let totalWidth = this.config.wallWidth * this.picSizeMultiplier;
    let totalHeight = this.config.wallHeight * this.picSizeMultiplier;

    let xMidpoint = this.config.wallWidth / 2;
    let outsideX1 = xMidpoint - (totalWidth / 2);
    let outsideX2 = xMidpoint + (totalWidth / 2);

    let yMidpoint = this.config.wallHeight / 2 - 12;
    let outsideY1 = yMidpoint - (totalHeight / 2);
    let outsideY2 = yMidpoint + (totalHeight / 2);

    // draw the outside
    const wfo = this.getNewPath(false);
    wfo.moveTo((outsideX1 * this.scale), outsideY1 * this.scale)
      .lineTo(outsideX2 * this.scale, outsideY1 * this.scale)
      .lineTo(outsideX2 * this.scale, outsideY2 * this.scale)
      .lineTo(outsideX1 * this.scale, outsideY2 * this.scale)
      .close();

    this.drawThing(wfo);

    // draw the inside
    const wfi = this.getNewPath(false);
    wfi.moveTo((outsideX1 + this.config.picFrameWidth) * this.scale, (outsideY1 + this.config.picFrameWidth) * this.scale)
      .lineTo((outsideX2 - this.config.picFrameWidth) * this.scale, (outsideY1 + this.config.picFrameWidth) * this.scale)
      .lineTo((outsideX2 - this.config.picFrameWidth) * this.scale, (outsideY2 - this.config.picFrameWidth) * this.scale)
      .lineTo((outsideX1 + this.config.picFrameWidth) * this.scale, (outsideY2 - this.config.picFrameWidth) * this.scale)
      .close();

    this.drawThing(wfi);

  }

  private drawThing(thing): void {
    const group = new Group();
    group.append(thing);

    this.surface.draw(group);
  }

  private drawDimension(x1, y1, x2, y2): void {
    // if x1 !== x2 and y1 !== y2, draw both dimensions for the box
    if (x1 === x2) {
      // only draw the Y dimension
      this.xDimensionPos += 4;
      this.queueVerticalDimension(this.xDimensionPos, y1, y2);
    } else if (y1 === y2) {
      // only draw the X dimension
      this.yDimensionPos += 4;
      this.queueHorizontalDimension(this.yDimensionPos, x1, x2);
    } else {
      // draw both dimensions
      this.queueVerticalDimension(x1, y1, y2);
      this.queueHorizontalDimension(y2, x1, x2);
    }
  }

  private queueVerticalDimension(x, y1, y2): void {
    this.dimensionQueue.push( {
      x,
      y1,
      y2,
      direction: 'vertical'
    });
  }

  private queueHorizontalDimension(y, x1, x2): void {
    this.dimensionQueue.push({
      y,
      x1,
      x2,
      direction: 'horizontal'
    });

  }

  private drawVerticalDimension(x, y1, y2): void {
    let dym = y2 - ((y2 - y1) / 2);
    let dimension = y2 - y1;

    let feet = Math.floor(dimension / 12);
    let inches = dimension % 12;
    if (feet < 3) {
      // just use inches
      feet = 0;
      inches = dimension;
    }
    if (inches % 1) {
      inches = +parseFloat(String(inches)).toFixed(2);
    }

    let dimensionString = (feet ? (feet + '\' ') : '') + (inches ? (inches + '"') : '');

    const d = new Path({
      stroke: {
        color: `#9999b6`,
        // color: `#c3c3c3`,
        width: 2
      }
    });

    d.moveTo(x * this.scale, y1 * this.scale)
      .lineTo(x * this.scale, y2 * this.scale);

    this.drawThing(d);


    // put end caps on
    const c1 = new Path({
      stroke: {
        color: `#9999b6`,
        // color: `#c3c3c3`,
        width: 2
      }
    });
    const c2 = new Path({
      stroke: {
        color: `#9999b6`,
        // color: `#c3c3c3`,
        width: 2
      }
    });

    // caps go side to side
    let cx1 = x - 1;
    let cx2 = x + 1;
    c1.moveTo(cx1 * this.scale, y1 * this.scale)
      .lineTo(cx2 * this.scale, y1 * this.scale);
    this.drawThing(c1);

    c2.moveTo(cx1 * this.scale, y2 * this.scale)
      .lineTo(cx2 * this.scale, y2 * this.scale);
    this.drawThing(c2);

    const text = new Text(
      dimensionString,
      new Point((x + 0.5) * this.scale, (dym - 1) * this.scale),
      { font: '10px Arial' }
    );
    this.drawThing(text);
  }

  private drawHorizontalDimension(y, x1, x2): void {
    let dxm = x2 - ((x2 - x1) / 2);
    let dimension = x2 - x1;

    let feet = Math.floor(dimension / 12);
    let inches = dimension % 12;
    if (feet < 3) {
      // just use inches
      feet = 0;
      inches = dimension;
    }
    if (inches % 1) {
      inches = +parseFloat(String(inches)).toFixed(2);
    }

    let dimensionString = (feet ? (feet + '\' ') : '') + (inches ? (inches + '"') : '');

    const d = new Path({
      stroke: {
        color: `#9999b6`,
        // color: `#c3c3c3`,
        width: 2
      }
    });

    d.moveTo(x1 * this.scale, y * this.scale)
      .lineTo(x2 * this.scale, y * this.scale);

    this.drawThing(d);


    // put end caps on
    const c1 = new Path({
      stroke: {
        color: `#9999b6`,
        // color: `#c3c3c3`,
        width: 2
      }
    });
    const c2 = new Path({
      stroke: {
        color: `#9999b6`,
        // color: `#c3c3c3`,
        width: 2
      }
    });

    // caps go up and down
    let cy1 = y - 1;
    let cy2 = y + 1;
    c1.moveTo(x1 * this.scale, cy1 * this.scale)
      .lineTo(x1 * this.scale, cy2 * this.scale);
    this.drawThing(c1);

    c2.moveTo(x2 * this.scale, cy1 * this.scale)
      .lineTo(x2 * this.scale, cy2 * this.scale);
    this.drawThing(c2);

    const text = new Text(
      dimensionString,
      new Point((dxm) * this.scale, (y + 0.5) * this.scale),
      { font: '10px Arial' }
    );
    this.drawThing(text);
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.innerWidth = window.innerWidth;
    this.innerHeight = window.innerHeight;
    this.redraw();
  }

  public ngAfterViewInit(): void {
    this.surface = this.createSurface();
    let saved = window.localStorage['wpconfig'];
    if (saved) {
      this.config = JSON.parse(saved);
    }

    this.redraw();
  }

  public ngOnDestroy() {
    this.surface.destroy();
  }

  private createSurface(): Surface {
    // Obtain a reference to the native DOM element of the wrapper
    const element = this.surfaceElement.nativeElement;

    // Create a drawing surface
    this.surface = Surface.create(element);

    return this.surface;
  }
}
