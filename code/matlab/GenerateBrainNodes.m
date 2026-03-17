clear
clc

img=imread('C:\Users\Conno\Documents\Connor Beck Research\images\brain.tif');
I=img(:,:,1);

[H,W]=size(I);
count=1;
Xstr='';
Ystr='';
for i=2:floor(0.025*H):H
    for j=2:floor(0.025*H):W
        if I(i,j)==255
            Xcoords(1,count)=j/W;
            Xstr=strcat(Xstr,',',num2str(j/W));
            Ystr=strcat(Ystr,',',num2str(i/W));
            Ycoords(1,count)=i/H;
            count=count+1;
        end
    end
end

%%
clear
clc

img=imread('C:\Users\Conno\Documents\CBR\CBR.png');
I=img(:,:,1);

[H,W]=size(I);
count=1;
Xstr='';
Ystr='';
blacklist=randi([1,550],1,12);
for i=2:floor(0.0221*H):H
    for j=2:floor(0.0221*H):W
        if I(i,j)==255
            if ~ismember(count,blacklist)
                Xcoords(1,count)=j/W;
                Xstr=strcat(Xstr,',',num2str(j/W));
                Ystr=strcat(Ystr,',',num2str(i/W));
                Ycoords(1,count)=i/H;
                
            end
            count=count+1;
        end
    end
end
